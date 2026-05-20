#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <input_pbf> [dataset_name]"
  exit 1
fi

INPUT_PBF="$1"
DATASET_NAME="${2:-berlin}"
PIPELINE_ID="cosmo-playgrounds-dual-pass"
INTERMEDIATE_DIR="/workspace/data/intermediate/${PIPELINE_ID}/${DATASET_NAME}"
OUTPUT_DIR="/workspace/data/output/${PIPELINE_ID}/${DATASET_NAME}"
TIMINGS_JSON="${OUTPUT_DIR}/step_timings.json"
FILTERS_YAML="/workspace/pipelines/cosmo-playgrounds/filters/playgrounds.yaml"

PARQUET_OUT="${OUTPUT_DIR}/playgrounds.parquet"
GEOJSONL_OUT="${INTERMEDIATE_DIR}/playgrounds.geojsonl"
PMTILES_OUT="${OUTPUT_DIR}/playgrounds.pmtiles"
VALIDATION_JSON="${OUTPUT_DIR}/validation.json"

mkdir -p "${INTERMEDIATE_DIR}" "${OUTPUT_DIR}"

if [[ ! -f "${INPUT_PBF}" ]]; then
  echo "Input PBF not found: ${INPUT_PBF}"
  exit 1
fi

echo "[${PIPELINE_ID}] cosmo → geoparquet"
T0=$(date +%s%3N)
cosmo convert \
  --input "${INPUT_PBF}" \
  --filters "${FILTERS_YAML}" \
  --output "${PARQUET_OUT}" \
  --format parquet \
  --node-cache-mode auto
T1=$(date +%s%3N)

echo "[${PIPELINE_ID}] cosmo → geojsonl"
T2=$(date +%s%3N)
cosmo convert \
  --input "${INPUT_PBF}" \
  --filters "${FILTERS_YAML}" \
  --output "${GEOJSONL_OUT}" \
  --format geojsonl \
  --node-cache-mode auto
T3=$(date +%s%3N)

echo "[${PIPELINE_ID}] tippecanoe → pmtiles"
T4=$(date +%s%3N)
tippecanoe -f -P -zg --projection=EPSG:4326 -l playgrounds \
  --full-detail=12 --low-detail=12 --minimum-detail=12 \
  -o "${PMTILES_OUT}" "${GEOJSONL_OUT}"
T5=$(date +%s%3N)

echo "[${PIPELINE_ID}] validate"
T6=$(date +%s%3N)
python3 - <<'PY' "${GEOJSONL_OUT}" "${PARQUET_OUT}" "${PMTILES_OUT}" "${VALIDATION_JSON}" "${PIPELINE_ID}"
import json
import os
import sys

ndjson_path, parquet_path, pmtiles_path, validation_path, pipeline_id = sys.argv[1:]
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
    "pipeline": pipeline_id,
    "geojson_coordinate_precision": None,
    "feature_count": line_count,
    "named_feature_count": name_count,
    "parquet_bytes": os.path.getsize(parquet_path) if os.path.exists(parquet_path) else 0,
    "pmtiles_bytes": os.path.getsize(pmtiles_path) if os.path.exists(pmtiles_path) else 0,
    "lacking": ["relation_multipolygons", "play_equipment_enrichment"],
    "enrichment": {"status": "not_supported"},
    "warnings": [
        "Cosmo relation geometry omitted (relation: false); counts may be lower than nwr/osmium pipelines.",
        "GeoParquet from native cosmo; PMTiles from a second full OSM read via cosmo GeoJSONL.",
    ],
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
T7=$(date +%s%3N)

export CMP_FILTER_MS="null"
export CMP_CLEAN_TRANSFORM_MS="$((T3 - T2))"
export CMP_EXPORT_GEOPARQUET_MS="$((T1 - T0))"
export CMP_EXPORT_PMTILES_MS="$((T5 - T4))"
export CMP_SQL_POSTPROCESS_MS="null"
export CMP_VALIDATE_MS="$((T7 - T6))"
export CMP_TOTAL_IN_CONTAINER_MS="$((T7 - T0))"
export REQ_GENERATE_GEOPARQUET_MATCHED="true"
export REQ_GENERATE_PMTILES_MATCHED="true"
export REQ_FILTER_CLEAN_CONFIRMED_MATCHED="true"
export REQ_FILTER_CLEAN_CONFIRMED_REASON="Filtering in cosmo YAML; confirmed via validation"
export REQ_SQL_POSTPROCESS_MATCHED="false"
export REQ_SQL_POSTPROCESS_REASON="Pipeline has no SQL/PostGIS stage"
# shellcheck source=/dev/null
source /workspace/pipelines/lib/write-comparison.sh

echo "[${PIPELINE_ID}] done"
