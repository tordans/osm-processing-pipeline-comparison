#!/usr/bin/env bash
# Write canonical benchmark artifacts: comparison.json and step_timings.json
set -euo pipefail

: "${PIPELINE_ID:?PIPELINE_ID required}"
: "${DATASET_NAME:?DATASET_NAME required}"
: "${INPUT_PBF:?INPUT_PBF required}"
: "${OUTPUT_DIR:?OUTPUT_DIR required}"
: "${VALIDATION_JSON:?VALIDATION_JSON required}"

: "${CMP_FILTER_MS:=null}"
: "${CMP_CLEAN_TRANSFORM_MS:=null}"
: "${CMP_EXPORT_GEOPARQUET_MS:=null}"
: "${CMP_EXPORT_PMTILES_MS:=null}"
: "${CMP_SQL_POSTPROCESS_MS:=null}"
: "${CMP_VALIDATE_MS:?CMP_VALIDATE_MS required}"
: "${CMP_TOTAL_IN_CONTAINER_MS:?CMP_TOTAL_IN_CONTAINER_MS required}"

: "${REQ_GENERATE_GEOPARQUET_MATCHED:?required}"
: "${REQ_GENERATE_PMTILES_MATCHED:?required}"
: "${REQ_FILTER_CLEAN_CONFIRMED_MATCHED:?required}"
: "${REQ_SQL_POSTPROCESS_MATCHED:?required}"

REQ_GENERATE_GEOPARQUET_REASON="${REQ_GENERATE_GEOPARQUET_REASON:-}"
REQ_GENERATE_PMTILES_REASON="${REQ_GENERATE_PMTILES_REASON:-}"
REQ_FILTER_CLEAN_CONFIRMED_REASON="${REQ_FILTER_CLEAN_CONFIRMED_REASON:-}"
REQ_SQL_POSTPROCESS_REASON="${REQ_SQL_POSTPROCESS_REASON:-}"

CMP_NOTES_JSON="${CMP_NOTES_JSON:-[]}"

if ! command -v jq >/dev/null 2>&1; then
  echo "write-comparison.sh requires jq"
  exit 1
fi

dataset_source_url() {
  case "$1" in
    berlin) echo "https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf" ;;
    germany) echo "https://download.geofabrik.de/europe/germany-latest.osm.pbf" ;;
    *) echo "" ;;
  esac
}

json_ms_or_null() {
  if [[ -z "${1:-}" || "${1}" == "null" ]]; then
    echo "null"
  else
    echo "${1}"
  fi
}

SOURCE_URL="$(dataset_source_url "${DATASET_NAME}")"
COMPARISON_JSON="${OUTPUT_DIR}/comparison.json"
TIMINGS_JSON="${OUTPUT_DIR}/step_timings.json"
PARQUET_BASENAME="${CMP_PARQUET_BASENAME:-playgrounds.parquet}"
PMTILES_BASENAME="${CMP_PMTILES_BASENAME:-playgrounds.pmtiles}"
PARQUET_OUT="${OUTPUT_DIR}/${PARQUET_BASENAME}"
PMTILES_OUT="${OUTPUT_DIR}/${PMTILES_BASENAME}"

F_MS="$(json_ms_or_null "${CMP_FILTER_MS}")"
CT_MS="$(json_ms_or_null "${CMP_CLEAN_TRANSFORM_MS}")"
GP_MS="$(json_ms_or_null "${CMP_EXPORT_GEOPARQUET_MS}")"
PM_MS="$(json_ms_or_null "${CMP_EXPORT_PMTILES_MS}")"
SQL_MS="$(json_ms_or_null "${CMP_SQL_POSTPROCESS_MS}")"
V_MS="$(json_ms_or_null "${CMP_VALIDATE_MS}")"

cat >"${TIMINGS_JSON}" <<EOF
{
  "pipeline": "${PIPELINE_ID}",
  "dataset": "${DATASET_NAME}",
  "steps_ms": {
    "filter": ${F_MS},
    "cleanTransform": ${CT_MS},
    "exportGeoParquet": ${GP_MS},
    "exportPmtiles": ${PM_MS},
    "sqlPostprocess": ${SQL_MS},
    "validate": ${V_MS}
  },
  "total_ms": ${CMP_TOTAL_IN_CONTAINER_MS}
}
EOF

VAL_OK="$(jq -r '.ok // false' "${VALIDATION_JSON}")"
FEATURE_COUNT="$(jq -r 'if .feature_count == null then null else .feature_count end' "${VALIDATION_JSON}")"
PARQUET_BYTES="$(jq -r '.parquet_bytes // 0' "${VALIDATION_JSON}")"
PMTILES_BYTES="$(jq -r '.pmtiles_bytes // 0' "${VALIDATION_JSON}")"

if [[ -f "${PARQUET_OUT}" ]]; then
  if [[ "$(uname -s)" == "Linux" ]]; then
    PQ_DISK=$(stat -c%s "${PARQUET_OUT}")
  else
    PQ_DISK=$(stat -f%z "${PARQUET_OUT}")
  fi
  [[ "${PARQUET_BYTES}" == "0" || "${PARQUET_BYTES}" == "null" ]] && PARQUET_BYTES="${PQ_DISK}"
fi

if [[ -f "${PMTILES_OUT}" ]]; then
  if [[ "$(uname -s)" == "Linux" ]]; then
    PM_DISK=$(stat -c%s "${PMTILES_OUT}")
  else
    PM_DISK=$(stat -f%z "${PMTILES_OUT}")
  fi
  [[ "${PMTILES_BYTES}" == "0" || "${PMTILES_BYTES}" == "null" ]] && PMTILES_BYTES="${PM_DISK}"
fi

WARNINGS_JSON="$(jq -c '(.warnings // []) | map(select(type == "string"))' "${VALIDATION_JSON}")"
NOTES_JSON="$(jq -nc --argjson a "${CMP_NOTES_JSON}" --argjson b "${WARNINGS_JSON}" '$a + $b | unique')"

req_block() {
  local matched="$1"
  local reason="$2"
  if [[ "${matched}" == "true" ]]; then
    jq -nc '{matched: true, reasonIfNotMatched: null}'
  else
    jq -nc --arg r "${reason}" '{matched: false, reasonIfNotMatched: $r}'
  fi
}

REQ_GP="$(req_block "${REQ_GENERATE_GEOPARQUET_MATCHED}" "${REQ_GENERATE_GEOPARQUET_REASON}")"
REQ_PM="$(req_block "${REQ_GENERATE_PMTILES_MATCHED}" "${REQ_GENERATE_PMTILES_REASON}")"
REQ_FC="$(req_block "${REQ_FILTER_CLEAN_CONFIRMED_MATCHED}" "${REQ_FILTER_CLEAN_CONFIRMED_REASON}")"
REQ_SQL="$(req_block "${REQ_SQL_POSTPROCESS_MATCHED}" "${REQ_SQL_POSTPROCESS_REASON}")"

jq -n \
  --arg parquetBasename "${PARQUET_BASENAME}" \
  --arg pmtilesBasename "${PMTILES_BASENAME}" \
  --arg pipelineId "${PIPELINE_ID}" \
  --arg datasetName "${DATASET_NAME}" \
  --arg inputPath "${INPUT_PBF}" \
  --arg sourceUrl "${SOURCE_URL}" \
  --argjson filterMs "${F_MS}" \
  --argjson cleanTransformMs "${CT_MS}" \
  --argjson exportGeoParquetMs "${GP_MS}" \
  --argjson exportPmtilesMs "${PM_MS}" \
  --argjson sqlPostprocessMs "${SQL_MS}" \
  --argjson validateMs "${V_MS}" \
  --argjson totalInContainer "${CMP_TOTAL_IN_CONTAINER_MS}" \
  --argjson reqGeoParquet "${REQ_GP}" \
  --argjson reqPmtiles "${REQ_PM}" \
  --argjson reqFilterClean "${REQ_FC}" \
  --argjson reqSql "${REQ_SQL}" \
  --argjson parquetBytes "${PARQUET_BYTES}" \
  --argjson pmtilesBytes "${PMTILES_BYTES}" \
  --argjson validationOk "${VAL_OK}" \
  --argjson featureCount "${FEATURE_COUNT}" \
  --argjson notes "${NOTES_JSON}" \
  '{
    pipelineId: $pipelineId,
    dataset: {name: $datasetName, inputPath: $inputPath, sourceUrl: $sourceUrl},
    timingsMs: {
      filter: $filterMs,
      cleanTransform: $cleanTransformMs,
      exportGeoParquet: $exportGeoParquetMs,
      exportPmtiles: $exportPmtilesMs,
      sqlPostprocess: $sqlPostprocessMs,
      validate: $validateMs,
      totalInContainer: $totalInContainer
    },
    requirements: {
      generateGeoParquet: $reqGeoParquet,
      generatePmtiles: $reqPmtiles,
      filterCleanConfirmed: $reqFilterClean,
      sqlPostprocessCleanConfirmed: $reqSql
    },
    artifacts: {
      geoParquetPath: $parquetBasename,
      geoParquetBytes: $parquetBytes,
      pmtilesPath: $pmtilesBasename,
      pmtilesBytes: $pmtilesBytes
    },
    quality: {
      validationOk: $validationOk,
      featureCount: $featureCount,
      notes: $notes
    }
  }' >"${COMPARISON_JSON}"
