#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <input_pbf> [dataset_name]"
  exit 1
fi

INPUT_PBF="$1"
DATASET_NAME="${2:-berlin}"
PIPELINE_ID="planetiler-playgrounds"
OUTPUT_DIR="/workspace/data/output/${PIPELINE_ID}/${DATASET_NAME}"
TIMINGS_JSON="${OUTPUT_DIR}/step_timings.json"
PMTILES_OUT="${OUTPUT_DIR}/playgrounds.pmtiles"
VALIDATION_JSON="${OUTPUT_DIR}/validation.json"
PLANETILER_LOG="${OUTPUT_DIR}/planetiler.log"
YAML_SCHEMA="/workspace/pipelines/planetiler-playgrounds/playgrounds.yml"

mkdir -p "${OUTPUT_DIR}"

if [[ ! -f "${INPUT_PBF}" ]]; then
  echo "Input PBF not found: ${INPUT_PBF}"
  exit 1
fi

if [[ "$(uname -s)" == "Linux" ]]; then
  PBF_BYTES=$(stat -c%s "${INPUT_PBF}")
else
  PBF_BYTES=$(stat -f%z "${INPUT_PBF}")
fi

HALF=$((PBF_BYTES / 2))
# Planetiler suggests ~0.5× PBF for -Xmx; small extracts still need a floor (512 MiB was too low for Berlin in Docker).
MIN_HEAP=$((1024 * 1024 * 1024))
MAX_HEAP=$((8 * 1024 * 1024 * 1024))
HEAP=${HALF}
[[ "${HEAP}" -lt "${MIN_HEAP}" ]] && HEAP=${MIN_HEAP}
[[ "${HEAP}" -gt "${MAX_HEAP}" ]] && HEAP=${MAX_HEAP}

if [[ -n "${PLANETILER_JAVA_OPTS:-}" ]]; then
  JVM_ARGS=${PLANETILER_JAVA_OPTS}
else
  JVM_ARGS="-Xmx${HEAP}"
fi
THREADS="$(nproc 2>/dev/null || echo 4)"

echo "[${PIPELINE_ID}] planetiler → pmtiles (${JVM_ARGS}, threads ${THREADS})"
T0=$(date +%s%3N)
set +e
# shellcheck disable=SC2086
java ${JVM_ARGS} -jar /opt/planetiler.jar "${YAML_SCHEMA}" \
  --osm-path="${INPUT_PBF}" \
  --output="${PMTILES_OUT}" \
  --force \
  --minzoom=0 \
  --maxzoom=12 \
  --threads="${THREADS}" \
  2>&1 | tee "${PLANETILER_LOG}"
PLANET_EXIT=${PIPESTATUS[0]}
set -e

if [[ "${PLANET_EXIT}" -ne 0 ]]; then
  echo "[${PIPELINE_ID}] planetiler failed with exit ${PLANET_EXIT}"
  exit "${PLANET_EXIT}"
fi
T1=$(date +%s%3N)

echo "[${PIPELINE_ID}] validate"
T2=$(date +%s%3N)

PMBYTES=0
if [[ -f "${PMTILES_OUT}" ]]; then
  if [[ "$(uname -s)" == "Linux" ]]; then
    PMBYTES=$(stat -c%s "${PMTILES_OUT}")
  else
    PMBYTES=$(stat -f%z "${PMTILES_OUT}")
  fi
fi

# Heuristic: non-empty PMTiles archive (tile feature count in logs is not comparable to OSM element counts).
HAS_FEATURES=false
[[ "${PMBYTES}" -gt 4096 ]] && HAS_FEATURES=true

jq -n \
  --arg pipeline "${PIPELINE_ID}" \
  --argjson pmtiles_bytes "${PMBYTES}" \
  --argjson parquet_bytes 0 \
  --argjson has_features "${HAS_FEATURES}" \
  --argjson pmtiles_exists "$( [[ -f "${PMTILES_OUT}" ]] && echo true || echo false )" \
  --argjson parquet_exists false \
  '{
    pipeline: $pipeline,
    feature_count: null,
    feature_count_note: "Planetiler logs count tile feature instances (features repeated across tiles), not a per-OSM-element count comparable to GeoJSONSeq pipelines.",
    named_feature_count: null,
    pmtiles_bytes: $pmtiles_bytes,
    parquet_bytes: $parquet_bytes,
    lacking: ["geoparquet", "play_equipment_enrichment"],
    enrichment: { status: "not_supported" },
    warnings: [],
    checks: {
      has_features: $has_features,
      pmtiles_exists: $pmtiles_exists,
      parquet_exists: $parquet_exists
    }
  } | .ok = (.checks.has_features and .checks.pmtiles_exists)' \
  >"${VALIDATION_JSON}.tmp"

mv "${VALIDATION_JSON}.tmp" "${VALIDATION_JSON}"

if [[ "$(jq -r .ok "${VALIDATION_JSON}")" != "true" ]]; then
  echo "[${PIPELINE_ID}] validation failed"
  exit 2
fi

T3=$(date +%s%3N)

cat >"${TIMINGS_JSON}" <<EOF
{
  "pipeline": "${PIPELINE_ID}",
  "dataset": "${DATASET_NAME}",
  "steps_ms": {
    "planetiler_pmtiles": $((T1 - T0)),
    "validate": $((T3 - T2))
  },
  "total_ms": $((T3 - T0))
}
EOF

echo "[${PIPELINE_ID}] done"
