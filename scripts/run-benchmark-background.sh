#!/usr/bin/env bash
# Start a benchmark run in the background (for long Germany runs).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATASET="${1:-germany}"
FORCE_FLAG=""
if [[ "${2:-}" == "--force" ]]; then
  FORCE_FLAG="--force"
fi

RUNS_DIR="${REPO_ROOT}/results/runs"
LOG_DIR="${REPO_ROOT}/results/logs"
mkdir -p "${RUNS_DIR}" "${LOG_DIR}"

STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
LOG_FILE="${LOG_DIR}/benchmark-${DATASET}-${STAMP}.log"
PID_FILE="${RUNS_DIR}/benchmark-${DATASET}.pid"
STATUS_FILE="${RUNS_DIR}/benchmark-${DATASET}.status.json"

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}")"
  if kill -0 "${OLD_PID}" 2>/dev/null; then
    echo "Benchmark already running (pid ${OLD_PID}). Log: ${LOG_DIR}/benchmark-${DATASET}-*.log"
    exit 1
  fi
  rm -f "${PID_FILE}"
fi

cat >"${STATUS_FILE}" <<EOF
{"dataset":"${DATASET}","state":"starting","startedAt":"${STAMP}","logFile":"${LOG_FILE}"}
EOF

nohup bun run "${REPO_ROOT}/orchestrator/src/index.ts" run --dataset "${DATASET}" ${FORCE_FLAG} \
  >"${LOG_FILE}" 2>&1 &
PID=$!
echo "${PID}" >"${PID_FILE}"

python3 - <<PY "${STATUS_FILE}" "${PID}" "${LOG_FILE}"
import json, sys
path, pid, log = sys.argv[1:4]
with open(path, "w", encoding="utf-8") as f:
    json.dump({
        "state": "running",
        "pid": int(pid),
        "logFile": log,
    }, f, indent=2)
    f.write("\n")
PY

echo "Started benchmark dataset=${DATASET} pid=${PID}"
echo "Log: ${LOG_FILE}"
echo "Status: ${STATUS_FILE}"
echo "Poll: bun run status:benchmark -- --dataset ${DATASET}"
