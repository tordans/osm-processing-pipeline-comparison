#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <input_pbf> [dataset_name]"
  exit 1
fi

INPUT_PBF="$1"
DATASET_NAME="${2:-berlin}"
PIPELINE_ID="roads-bikelanes-osmnexus-postgis"
PIPELINE_DIR="/workspace/pipelines/roads-bikelanes-osmnexus"
INTERMEDIATE_DIR="/workspace/data/intermediate/${PIPELINE_ID}/${DATASET_NAME}"
OUTPUT_DIR="/workspace/data/output/${PIPELINE_ID}/${DATASET_NAME}"

mkdir -p "${INTERMEDIATE_DIR}" "${OUTPUT_DIR}"

COORD_PRECISION=7
PG_VERSION="${PG_VERSION:-16}"

NDJSON_OUT="${INTERMEDIATE_DIR}/bikelanes.ndjson"
PARQUET_OUT="${OUTPUT_DIR}/bikelanes.parquet"
PMTILES_OUT="${OUTPUT_DIR}/bikelanes.pmtiles"
VALIDATION_JSON="${OUTPUT_DIR}/validation.json"

T0=$(date +%s%3N)

echo "[${PIPELINE_ID}] skip prefilter (filtering in OSMnexus classifier)"
CMP_FILTER_MS="null"

echo "[${PIPELINE_ID}] start postgres cluster"
pg_ctlcluster "${PG_VERSION}" main start
trap 'pg_ctlcluster "${PG_VERSION}" main stop' EXIT

echo "[${PIPELINE_ID}] create benchmark database"
T_CT0=$(date +%s%3N)
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS osm_benchmark;"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE osm_benchmark;"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d osm_benchmark -c "CREATE EXTENSION IF NOT EXISTS postgis;"
T_CT1=$(date +%s%3N)

echo "[${PIPELINE_ID}] import pbf with osmnexus (tilda roads + bikelanes)"
T_CT2=$(date +%s%3N)
runuser -u postgres -- env PGDATABASE=osm_benchmark osmnexus "${INPUT_PBF}" \
  --config-dir "${PIPELINE_DIR}/configs-tilda" \
  --output pg \
  --emit-way-geometries \
  --threads 0
T_CT3=$(date +%s%3N)

echo "[${PIPELINE_ID}] run postprocessing SQL"
T_SQL0=$(date +%s%3N)
runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
  -d osm_benchmark \
  -f "${PIPELINE_DIR}/sql/postprocess.sql"
T_SQL1=$(date +%s%3N)

echo "[${PIPELINE_ID}] export bikelanes ndjson from PostGIS (part of cleanTransform)"
T_CT4=$(date +%s%3N)
runuser -u postgres -- ogr2ogr -t_srs EPSG:4326 -f GeoJSONSeq \
  -lco "COORDINATE_PRECISION=${COORD_PRECISION}" -lco RFC7946=YES \
  "${NDJSON_OUT}" \
  "PG:dbname=osm_benchmark" \
  -sql "SELECT id, osm_id, category, name, oneway, surface, smoothness, width, side, geom FROM bikelanes_export"
T_CT5=$(date +%s%3N)

echo "[${PIPELINE_ID}] export geoparquet from ndjson"
T_GP0=$(date +%s%3N)
python3 - <<PY
import geopandas as gpd

src = "${NDJSON_OUT}"
dst = "${PARQUET_OUT}"
gdf = gpd.read_file(src, driver="GeoJSONSeq")
gdf.to_parquet(dst, index=False)
PY
T_GP1=$(date +%s%3N)

echo "[${PIPELINE_ID}] build pmtiles"
T_PM0=$(date +%s%3N)
tippecanoe -f -P -zg --projection=EPSG:4326 -l bikelanes \
  --drop-densest-as-needed \
  --full-detail=12 --low-detail=12 --minimum-detail=12 \
  -o "${PMTILES_OUT}" "${NDJSON_OUT}"
T_PM1=$(date +%s%3N)

echo "[${PIPELINE_ID}] run validations"
T_VAL0=$(date +%s%3N)
python3 - <<'PY' "${NDJSON_OUT}" "${PARQUET_OUT}" "${PMTILES_OUT}" "${VALIDATION_JSON}" "${PIPELINE_ID}"
import json
import os
import subprocess
import sys

ndjson_path, parquet_path, pmtiles_path, validation_path, pipeline_id = sys.argv[1:]

line_count = 0
with open(ndjson_path, "r", encoding="utf-8") as f:
    for line in f:
        if line.strip():
            line_count += 1

def psql_scalar(sql: str) -> int:
    out = subprocess.check_output(
        ["runuser", "-u", "postgres", "--", "psql", "-At", "-d", "osm_benchmark", "-c", sql],
        text=True,
    ).strip()
    return int(out or 0)

def psql_categories() -> dict:
    out = subprocess.check_output(
        [
            "runuser",
            "-u",
            "postgres",
            "--",
            "psql",
            "-At",
            "-d",
            "osm_benchmark",
            "-c",
            "SELECT COALESCE(category, '(null)'), count(*) FROM bikelanes_export GROUP BY 1 ORDER BY 2 DESC;",
        ],
        text=True,
    )
    categories = {}
    for row in out.splitlines():
        if not row.strip():
            continue
        cat, count = row.split("|", 1)
        categories[cat] = int(count)
    return categories

bikelanes_count = psql_scalar("SELECT count(*) FROM bikelanes_export;")
roads_count = psql_scalar("SELECT count(*) FROM roads_export;")
bikelanes_categories = psql_categories()

validation = {
    "pipeline": pipeline_id,
    "geojson_coordinate_precision": 7,
    "feature_count": line_count,
    "bikelanes_count": bikelanes_count,
    "roads_count": roads_count,
    "bikelanes_categories": bikelanes_categories,
    "parquet_bytes": os.path.getsize(parquet_path) if os.path.exists(parquet_path) else 0,
    "pmtiles_bytes": os.path.getsize(pmtiles_path) if os.path.exists(pmtiles_path) else 0,
    "checks": {
        "has_features": line_count > 0,
        "parquet_exists": os.path.exists(parquet_path),
        "pmtiles_exists": os.path.exists(pmtiles_path),
        "bikelanes_count_ok": bikelanes_count > 30000,
    },
}

validation["ok"] = all(validation["checks"].values())

with open(validation_path, "w", encoding="utf-8") as out:
    json.dump(validation, out, indent=2)

if not validation["ok"]:
    raise SystemExit(2)
PY
T_VAL1=$(date +%s%3N)

T_END=$(date +%s%3N)

export PIPELINE_ID
export DATASET_NAME
export INPUT_PBF
export OUTPUT_DIR
export VALIDATION_JSON
export CMP_FILTER_MS
export CMP_CLEAN_TRANSFORM_MS="$(( (T_CT1 - T_CT0) + (T_CT3 - T_CT2) + (T_CT5 - T_CT4) ))"
export CMP_EXPORT_GEOPARQUET_MS="$((T_GP1 - T_GP0))"
export CMP_EXPORT_PMTILES_MS="$((T_PM1 - T_PM0))"
export CMP_SQL_POSTPROCESS_MS="$((T_SQL1 - T_SQL0))"
export CMP_VALIDATE_MS="$((T_VAL1 - T_VAL0))"
export CMP_TOTAL_IN_CONTAINER_MS="$((T_END - T0))"
export REQ_GENERATE_GEOPARQUET_MATCHED="true"
export REQ_GENERATE_PMTILES_MATCHED="true"
export REQ_FILTER_CLEAN_CONFIRMED_MATCHED="true"
export REQ_FILTER_CLEAN_CONFIRMED_REASON="No dedicated prefilter; filtering in OSMnexus classifier"
export REQ_SQL_POSTPROCESS_MATCHED="true"
export CMP_PARQUET_BASENAME="bikelanes.parquet"
export CMP_PMTILES_BASENAME="bikelanes.pmtiles"
# shellcheck source=/dev/null
source /workspace/pipelines/lib/write-comparison.sh

echo "[${PIPELINE_ID}] done"
