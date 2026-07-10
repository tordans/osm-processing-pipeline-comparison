#!/usr/bin/env bash
set -euo pipefail

export PIPELINE_ID="roads-bikelanes-osm2pgsql-prefilter-osmium"
export SKIP_FILTER="false"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/run-common.sh" "$@"
