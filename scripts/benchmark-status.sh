#!/usr/bin/env bash
# Lightweight status for background benchmark runs (token-efficient polling).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATASET="${1:-germany}"
RUNS_DIR="${REPO_ROOT}/results/runs"
PID_FILE="${RUNS_DIR}/benchmark-${DATASET}.pid"
STATUS_FILE="${RUNS_DIR}/benchmark-${DATASET}.status.json"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "No active PID file for dataset=${DATASET}"
  if [[ -f "${STATUS_FILE}" ]]; then
    cat "${STATUS_FILE}"
  fi
  exit 0
fi

PID="$(cat "${PID_FILE}")"
if kill -0 "${PID}" 2>/dev/null; then
  STATE="running"
else
  STATE="finished"
  rm -f "${PID_FILE}"
fi

LATEST_RUN="$(ls -1t "${RUNS_DIR}"/run-*-"${DATASET}".json 2>/dev/null | head -1 || true)"
PIPELINE_COUNT=0
OK_COUNT=0
if [[ -n "${LATEST_RUN}" && -f "${LATEST_RUN}" ]]; then
  read -r PIPELINE_COUNT OK_COUNT <<<"$(python3 - <<PY "${LATEST_RUN}"
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    r = json.load(f)
ps = r.get("pipelines") or []
ok = sum(1 for p in ps if p.get("status") == "ok")
print(len(ps), ok)
PY
)"
fi

python3 - <<PY "${STATUS_FILE}" "${STATE}" "${PID}" "${LATEST_RUN}" "${PIPELINE_COUNT}" "${OK_COUNT}"
import json, sys
path, state, pid, latest, n, ok = sys.argv[1:7]
payload = {"state": state, "pid": int(pid) if pid else None, "latestRunArtifact": latest or None}
if latest:
    payload["pipelinesRecorded"] = int(n)
    payload["pipelinesOk"] = int(ok)
with open(path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
print(json.dumps(payload, indent=2))
PY
