#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <input_pbf> [dataset_name]"
  exit 1
fi

INPUT_PBF="$1"
DATASET_NAME="${2:-berlin}"
PIPELINE_ID="osm2pgsql-postgis-prefilter-osmfilter"
INTERMEDIATE_DIR="/workspace/data/intermediate/${PIPELINE_ID}/${DATASET_NAME}"
OUTPUT_DIR="/workspace/data/output/${PIPELINE_ID}/${DATASET_NAME}"
TIMINGS_JSON="${OUTPUT_DIR}/step_timings.json"

mkdir -p "${INTERMEDIATE_DIR}" "${OUTPUT_DIR}"

# Match OSM / osmium-gdal GeoJSONSeq rounding (1e-7 deg) and shared tippecanoe detail settings.
COORD_PRECISION=7

# osmfilter needs seekable .o5m; B2 uses Osmium on PBF directly — we time convert + filter for comparison.
FULL_O5M="${INTERMEDIATE_DIR}/full.o5m"
FILTERED_O5M="${INTERMEDIATE_DIR}/filtered.o5m"
NDJSON_OUT="${INTERMEDIATE_DIR}/playgrounds.ndjson"
PARQUET_OUT="${OUTPUT_DIR}/playgrounds.parquet"
PMTILES_OUT="${OUTPUT_DIR}/playgrounds.pmtiles"
VALIDATION_JSON="${OUTPUT_DIR}/validation.json"

echo "[pipeline-b2-osmfilter] pbf -> o5m (osmconvert), then filter (osmfilter)"
T0=$(date +%s%3N)
osmconvert "${INPUT_PBF}" -o="${FULL_O5M}"
T1=$(date +%s%3N)
# Align with B2 osmium: nwr/amenity=playground, nwr/playground=*
osmfilter "${FULL_O5M}" \
  --keep="amenity=playground or playground=" \
  -o="${FILTERED_O5M}"
T2=$(date +%s%3N)
rm -f "${FULL_O5M}"
T3=$(date +%s%3N)

echo "[pipeline-b2-osmfilter] start postgres cluster"
pg_ctlcluster 16 main start
trap 'pg_ctlcluster 16 main stop' EXIT

echo "[pipeline-b2-osmfilter] create benchmark database"
T4=$(date +%s%3N)
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS osm_benchmark;"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE osm_benchmark;"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d osm_benchmark -c "CREATE EXTENSION postgis;"
T5=$(date +%s%3N)

echo "[pipeline-b2-osmfilter] import filtered o5m with osm2pgsql flex"
T6=$(date +%s%3N)
runuser -u postgres -- osm2pgsql \
  --database osm_benchmark \
  --output flex \
  --style /workspace/pipelines/osm2pgsql-postgis-prefilter/style/playground.lua \
  --create \
  --slim \
  "${FILTERED_O5M}"
T7=$(date +%s%3N)

echo "[pipeline-b2-osmfilter] run postprocessing SQL"
T8=$(date +%s%3N)
runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
  -d osm_benchmark \
  -f /workspace/pipelines/osm2pgsql-postgis-prefilter/sql/postprocess.sql
T9=$(date +%s%3N)

echo "[pipeline-b2-osmfilter] export ndjson from PostGIS"
T10=$(date +%s%3N)
runuser -u postgres -- ogr2ogr -t_srs EPSG:4326 -f GeoJSONSeq \
  -lco "COORDINATE_PRECISION=${COORD_PRECISION}" -lco RFC7946=YES \
  "${NDJSON_OUT}" \
  "PG:dbname=osm_benchmark" \
  -sql "SELECT osm_id, osm_type, name, amenity, playground, play_equipment_count, geom FROM benchmark.playground_export"
T11=$(date +%s%3N)

echo "[pipeline-b2-osmfilter] export geoparquet from ndjson (geopandas/pyarrow; GDAL lacks Parquet driver)"
T12=$(date +%s%3N)
python3 - <<PY
import geopandas as gpd

src = "${NDJSON_OUT}"
dst = "${PARQUET_OUT}"
gdf = gpd.read_file(src, driver="GeoJSONSeq")
gdf.to_parquet(dst, index=False)
PY
T13=$(date +%s%3N)

echo "[pipeline-b2-osmfilter] build pmtiles"
T14=$(date +%s%3N)
tippecanoe -f -P -zg --projection=EPSG:4326 -l playgrounds \
  --full-detail=12 --low-detail=12 --minimum-detail=12 \
  -o "${PMTILES_OUT}" "${NDJSON_OUT}"
T15=$(date +%s%3N)

echo "[pipeline-b2-osmfilter] run validations"
T16=$(date +%s%3N)
python3 - <<'PY' "${NDJSON_OUT}" "${PARQUET_OUT}" "${PMTILES_OUT}" "${VALIDATION_JSON}"
import json
import os
import sys

ndjson_path, parquet_path, pmtiles_path, validation_path = sys.argv[1:]
line_count = 0
enriched_count = 0

with open(ndjson_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        line_count += 1
        try:
            feature = json.loads(line)
            props = feature.get("properties") or {}
            if props.get("play_equipment_count") is not None:
                enriched_count += 1
        except Exception:
            pass

warnings = []
if line_count > 0 and enriched_count == 0:
    warnings.append(
        "No exported features include play_equipment_count; dataset may lack amenity=playground polygons."
    )

validation = {
    "pipeline": "osm2pgsql-postgis-prefilter-osmfilter",
    "geojson_coordinate_precision": 7,
    "feature_count": line_count,
    "enriched_polygon_count": enriched_count,
    "parquet_bytes": os.path.getsize(parquet_path) if os.path.exists(parquet_path) else 0,
    "pmtiles_bytes": os.path.getsize(pmtiles_path) if os.path.exists(pmtiles_path) else 0,
    "enrichment": {"status": "supported"},
    "warnings": warnings,
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
T17=$(date +%s%3N)

cat > "${TIMINGS_JSON}" <<EOF
{
  "pipeline": "${PIPELINE_ID}",
  "dataset": "${DATASET_NAME}",
  "steps_ms": {
    "prefilter": $((T3 - T0)),
    "prefilter_convert": $((T1 - T0)),
    "prefilter_osmfilter": $((T2 - T1)),
    "prepare_db": $((T5 - T4)),
    "extract_import": $((T7 - T6)),
    "transform_enrich_sql": $((T9 - T8)),
    "export_ndjson": $((T11 - T10)),
    "export_geoparquet": $((T13 - T12)),
    "export_pmtiles": $((T15 - T14)),
    "validate": $((T17 - T16))
  },
  "total_ms": $((T17 - T0))
}
EOF

echo "[pipeline-b2-osmfilter] done"
