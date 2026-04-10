#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <input_pbf> [dataset_name]"
  exit 1
fi

INPUT_PBF="$1"
DATASET_NAME="${2:-berlin}"
PIPELINE_ID="osmium-gdal-tippecanoe"
INTERMEDIATE_DIR="/workspace/data/intermediate/${PIPELINE_ID}/${DATASET_NAME}"
OUTPUT_DIR="/workspace/data/output/${PIPELINE_ID}/${DATASET_NAME}"
TIMINGS_JSON="${OUTPUT_DIR}/step_timings.json"

mkdir -p "${INTERMEDIATE_DIR}" "${OUTPUT_DIR}"

# OSM node coordinates are defined at 1e-7 degree (~1 cm) resolution. PostGIS stores float8, but
# meaningful precision matches that. Use the same GeoJSON coordinate rounding and WGS84 output as
# the osm2pgsql pipelines so NDJSON → tippecanoe sees comparable vertex values.
COORD_PRECISION=7

FILTERED_PBF="${INTERMEDIATE_DIR}/filtered.osm.pbf"
POINTS_NDJSON="${INTERMEDIATE_DIR}/points.ndjson"
LINES_NDJSON="${INTERMEDIATE_DIR}/lines.ndjson"
POLYGONS_NDJSON="${INTERMEDIATE_DIR}/multipolygons.ndjson"
ALL_NDJSON="${INTERMEDIATE_DIR}/all.ndjson"
PARQUET_OUT="${OUTPUT_DIR}/playgrounds.parquet"
PMTILES_OUT="${OUTPUT_DIR}/playgrounds.pmtiles"
VALIDATION_JSON="${OUTPUT_DIR}/validation.json"

echo "[pipeline-a] filter input with osmium"
T0=$(date +%s%3N)
osmium tags-filter "${INPUT_PBF}" \
  nwr/amenity=playground \
  nwr/playground=* \
  -o "${FILTERED_PBF}" -O
T1=$(date +%s%3N)

echo "[pipeline-a] convert filtered PBF layers to ndjson"
T2=$(date +%s%3N)
ogr2ogr -skipfailures -t_srs EPSG:4326 -f GeoJSONSeq \
  -lco "COORDINATE_PRECISION=${COORD_PRECISION}" -lco RFC7946=YES \
  "${POINTS_NDJSON}" "${FILTERED_PBF}" points
ogr2ogr -skipfailures -t_srs EPSG:4326 -f GeoJSONSeq \
  -lco "COORDINATE_PRECISION=${COORD_PRECISION}" -lco RFC7946=YES \
  "${LINES_NDJSON}" "${FILTERED_PBF}" lines
ogr2ogr -skipfailures -t_srs EPSG:4326 -f GeoJSONSeq \
  -lco "COORDINATE_PRECISION=${COORD_PRECISION}" -lco RFC7946=YES \
  "${POLYGONS_NDJSON}" "${FILTERED_PBF}" multipolygons

cat "${POINTS_NDJSON}" "${LINES_NDJSON}" "${POLYGONS_NDJSON}" > "${ALL_NDJSON}"
T3=$(date +%s%3N)

echo "[pipeline-a] create geoparquet from ndjson (geopandas/pyarrow)"
T4=$(date +%s%3N)
python3 - <<PY
import geopandas as gpd

src = "${ALL_NDJSON}"
dst = "${PARQUET_OUT}"
gdf = gpd.read_file(src, driver="GeoJSONSeq")
gdf.to_parquet(dst, index=False)
PY
T5=$(date +%s%3N)

echo "[pipeline-a] create pmtiles with tippecanoe"
T6=$(date +%s%3N)
tippecanoe -f -P -zg --projection=EPSG:4326 -l playgrounds \
  --full-detail=12 --low-detail=12 --minimum-detail=12 \
  -o "${PMTILES_OUT}" "${ALL_NDJSON}"
T7=$(date +%s%3N)

echo "[pipeline-a] run validations"
T8=$(date +%s%3N)
python3 - <<'PY' "${ALL_NDJSON}" "${PARQUET_OUT}" "${PMTILES_OUT}" "${VALIDATION_JSON}"
import json
import os
import sys

ndjson_path, parquet_path, pmtiles_path, validation_path = sys.argv[1:]
line_count = 0
name_count = 0

with open(ndjson_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        line_count += 1
        try:
            feature = json.loads(line)
            props = feature.get("properties") or {}
            if props.get("name"):
                name_count += 1
        except Exception:
            pass

validation = {
    "pipeline": "osmium-gdal-tippecanoe",
    "geojson_coordinate_precision": 7,
    "feature_count": line_count,
    "named_feature_count": name_count,
    "parquet_bytes": os.path.getsize(parquet_path) if os.path.exists(parquet_path) else 0,
    "pmtiles_bytes": os.path.getsize(pmtiles_path) if os.path.exists(pmtiles_path) else 0,
    "enrichment": {"status": "not_supported"},
    "checks": {
        "has_features": line_count > 0,
        "parquet_exists": os.path.exists(parquet_path),
        "pmtiles_exists": os.path.exists(pmtiles_path),
    },
}

validation["ok"] = all(validation["checks"].values())

with open(validation_path, "w", encoding="utf-8") as out:
    json.dump(validation, out, indent=2)

if not validation["ok"]:
    raise SystemExit(2)
PY
T9=$(date +%s%3N)

cat > "${TIMINGS_JSON}" <<EOF
{
  "pipeline": "${PIPELINE_ID}",
  "dataset": "${DATASET_NAME}",
  "steps_ms": {
    "extract_filter": $((T1 - T0)),
    "transform_convert": $((T3 - T2)),
    "export_geoparquet": $((T5 - T4)),
    "export_pmtiles": $((T7 - T6)),
    "validate": $((T9 - T8))
  },
  "total_ms": $((T9 - T0))
}
EOF

echo "[pipeline-a] done"
