#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <input_pbf> [dataset_name]"
  exit 1
fi

INPUT_PBF="$1"
DATASET_NAME="${2:-berlin}"
PIPELINE_ID="osmnexus-postgis"
INTERMEDIATE_DIR="/workspace/data/intermediate/${PIPELINE_ID}/${DATASET_NAME}"
OUTPUT_DIR="/workspace/data/output/${PIPELINE_ID}/${DATASET_NAME}"
TIMINGS_JSON="${OUTPUT_DIR}/step_timings.json"

mkdir -p "${INTERMEDIATE_DIR}" "${OUTPUT_DIR}"

COORD_PRECISION=7

NDJSON_OUT="${INTERMEDIATE_DIR}/playgrounds.ndjson"
PARQUET_OUT="${OUTPUT_DIR}/playgrounds.parquet"
PMTILES_OUT="${OUTPUT_DIR}/playgrounds.pmtiles"
VALIDATION_JSON="${OUTPUT_DIR}/validation.json"

# No osmium prefilter: OSMnexus filters while reading via the topic config
# (single pass, PBF in -> classified rows out), like B1/cosmo declare it.
T0=$(date +%s%3N)

echo "[pipeline-nexus-pg] start postgres cluster"
pg_ctlcluster 16 main start
trap 'pg_ctlcluster 16 main stop' EXIT

echo "[pipeline-nexus-pg] create benchmark database"
T2=$(date +%s%3N)
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS osm_benchmark;"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE osm_benchmark;"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d osm_benchmark -c "CREATE EXTENSION postgis;"
T3=$(date +%s%3N)

echo "[pipeline-nexus-pg] import pbf with osmnexus (filters while reading)"
T4=$(date +%s%3N)
runuser -u postgres -- env PGDATABASE=osm_benchmark osmnexus "${INPUT_PBF}" \
  --config-dir /workspace/pipelines/osmnexus-playgrounds/configs/playgrounds \
  --output pg \
  --emit-way-geometries \
  --emit-relation-geometries \
  --threads 0
T5=$(date +%s%3N)

echo "[pipeline-nexus-pg] run postprocessing SQL"
T6=$(date +%s%3N)
runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
  -d osm_benchmark \
  -f /workspace/pipelines/osmnexus-playgrounds/sql/postprocess.sql
T7=$(date +%s%3N)

echo "[pipeline-nexus-pg] export ndjson from PostGIS"
T8=$(date +%s%3N)
runuser -u postgres -- ogr2ogr -t_srs EPSG:4326 -f GeoJSONSeq \
  -lco "COORDINATE_PRECISION=${COORD_PRECISION}" -lco RFC7946=YES \
  "${NDJSON_OUT}" \
  "PG:dbname=osm_benchmark" \
  -sql "SELECT osm_id, osm_type, name, leisure, playground, play_equipment_count, geom FROM benchmark.playground_export"
T9=$(date +%s%3N)

echo "[pipeline-nexus-pg] export geoparquet from ndjson (geopandas/pyarrow; GDAL lacks Parquet driver)"
T10=$(date +%s%3N)
python3 - <<PY
import geopandas as gpd

src = "${NDJSON_OUT}"
dst = "${PARQUET_OUT}"
gdf = gpd.read_file(src, driver="GeoJSONSeq")
gdf.to_parquet(dst, index=False)
PY
T11=$(date +%s%3N)

echo "[pipeline-nexus-pg] build pmtiles"
T12=$(date +%s%3N)
tippecanoe -f -P -zg --projection=EPSG:4326 -l playgrounds \
  --full-detail=12 --low-detail=12 --minimum-detail=12 \
  -o "${PMTILES_OUT}" "${NDJSON_OUT}"
T13=$(date +%s%3N)

echo "[pipeline-nexus-pg] run validations"
T14=$(date +%s%3N)
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
        "No exported features include play_equipment_count; dataset may lack leisure=playground polygons."
    )

validation = {
    "pipeline": "osmnexus-postgis",
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
T15=$(date +%s%3N)

export CMP_FILTER_MS="null"
export CMP_CLEAN_TRANSFORM_MS="$(( (T3 - T2) + (T5 - T4) + (T9 - T8) ))"
export CMP_EXPORT_GEOPARQUET_MS="$((T11 - T10))"
export CMP_EXPORT_PMTILES_MS="$((T13 - T12))"
export CMP_SQL_POSTPROCESS_MS="$((T7 - T6))"
export CMP_VALIDATE_MS="$((T15 - T14))"
export CMP_TOTAL_IN_CONTAINER_MS="$((T15 - T0))"
export REQ_GENERATE_GEOPARQUET_MATCHED="true"
export REQ_GENERATE_PMTILES_MATCHED="true"
export REQ_FILTER_CLEAN_CONFIRMED_MATCHED="true"
export REQ_FILTER_CLEAN_CONFIRMED_REASON="No dedicated prefilter; filtering in OSMnexus classifier"
export REQ_SQL_POSTPROCESS_MATCHED="true"
# shellcheck source=/dev/null
source /workspace/pipelines/lib/write-comparison.sh

echo "[pipeline-nexus-pg] done"
