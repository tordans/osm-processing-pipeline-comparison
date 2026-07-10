#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <input_pbf> [dataset_name]"
  exit 1
fi

INPUT_PBF="$1"
DATASET_NAME="${2:-berlin}"
PIPELINE_ID="roads-bikelanes-osmnexus-geojsonseq"
PIPELINE_DIR="/workspace/pipelines/roads-bikelanes-osmnexus"
INTERMEDIATE_DIR="/workspace/data/intermediate/${PIPELINE_ID}/${DATASET_NAME}"
OUTPUT_DIR="/workspace/data/output/${PIPELINE_ID}/${DATASET_NAME}"

mkdir -p "${INTERMEDIATE_DIR}" "${OUTPUT_DIR}"

BIKELANES_NDJSON="${INTERMEDIATE_DIR}/bikelanes.ndjson"
ROADS_NDJSON="${INTERMEDIATE_DIR}/roads.ndjson"
PARQUET_OUT="${OUTPUT_DIR}/bikelanes.parquet"
PMTILES_OUT="${OUTPUT_DIR}/bikelanes.pmtiles"
VALIDATION_JSON="${OUTPUT_DIR}/validation.json"

T0=$(date +%s%3N)

echo "[${PIPELINE_ID}] skip prefilter (filtering in OSMnexus classifier)"
CMP_FILTER_MS="null"

echo "[${PIPELINE_ID}] classify with osmnexus geojsonseq output"
T_CT0=$(date +%s%3N)
osmnexus "${INPUT_PBF}" \
  --config-dir "${PIPELINE_DIR}/configs-tilda" \
  --output geojsonseq \
  --out-dir "${INTERMEDIATE_DIR}" \
  --threads 0
T_CT1=$(date +%s%3N)

echo "[${PIPELINE_ID}] export geoparquet from bikelanes ndjson"
T_GP0=$(date +%s%3N)
python3 - <<PY
import json

import geopandas as gpd
from shapely.geometry import shape

src = "${BIKELANES_NDJSON}"
dst = "${PARQUET_OUT}"
records = []
geoms = []
with open(src, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        feat = json.loads(line)
        geoms.append(shape(feat["geometry"]))
        records.append(feat.get("properties") or {})
gdf = gpd.GeoDataFrame(records, geometry=geoms, crs="EPSG:4326")
for col in gdf.columns:
    if col != gdf.geometry.name and gdf[col].dtype == object:
        gdf[col] = gdf[col].map(lambda v: None if v is None else str(v))
gdf.to_parquet(dst, index=False)
PY
T_GP1=$(date +%s%3N)

echo "[${PIPELINE_ID}] build pmtiles"
T_PM0=$(date +%s%3N)
tippecanoe -f -P -zg --projection=EPSG:4326 -l bikelanes \
  --drop-densest-as-needed \
  --full-detail=12 --low-detail=12 --minimum-detail=12 \
  -o "${PMTILES_OUT}" "${BIKELANES_NDJSON}"
T_PM1=$(date +%s%3N)

echo "[${PIPELINE_ID}] run validations"
T_VAL0=$(date +%s%3N)
python3 - <<'PY' "${BIKELANES_NDJSON}" "${ROADS_NDJSON}" "${PARQUET_OUT}" "${PMTILES_OUT}" "${VALIDATION_JSON}" "${PIPELINE_ID}"
import json
import os
import sys
from collections import Counter

bikelanes_path, roads_path, parquet_path, pmtiles_path, validation_path, pipeline_id = sys.argv[1:]

def count_ndjson(path: str) -> int:
    count = 0
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                count += 1
    return count

def bikelanes_categories(path: str) -> dict:
    categories = Counter()
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                feature = json.loads(line)
                props = feature.get("properties") or {}
                cat = props.get("category") or "(null)"
                categories[cat] += 1
            except Exception:
                pass
    return dict(categories.most_common())

bikelanes_count = count_ndjson(bikelanes_path)
roads_count = count_ndjson(roads_path)
category_counts = bikelanes_categories(bikelanes_path)

validation = {
    "pipeline": pipeline_id,
    "geojson_coordinate_precision": 7,
    "feature_count": bikelanes_count,
    "bikelanes_count": bikelanes_count,
    "roads_count": roads_count,
    "bikelanes_categories": category_counts,
    "parquet_bytes": os.path.getsize(parquet_path) if os.path.exists(parquet_path) else 0,
    "pmtiles_bytes": os.path.getsize(pmtiles_path) if os.path.exists(pmtiles_path) else 0,
    "checks": {
        "has_features": bikelanes_count > 0,
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
export CMP_CLEAN_TRANSFORM_MS="$((T_CT1 - T_CT0))"
export CMP_EXPORT_GEOPARQUET_MS="$((T_GP1 - T_GP0))"
export CMP_EXPORT_PMTILES_MS="$((T_PM1 - T_PM0))"
export CMP_SQL_POSTPROCESS_MS="null"
export CMP_VALIDATE_MS="$((T_VAL1 - T_VAL0))"
export CMP_TOTAL_IN_CONTAINER_MS="$((T_END - T0))"
export REQ_GENERATE_GEOPARQUET_MATCHED="true"
export REQ_GENERATE_PMTILES_MATCHED="true"
export REQ_FILTER_CLEAN_CONFIRMED_MATCHED="true"
export REQ_FILTER_CLEAN_CONFIRMED_REASON="No dedicated prefilter; filtering in OSMnexus classifier"
export REQ_SQL_POSTPROCESS_MATCHED="false"
export REQ_SQL_POSTPROCESS_REASON="No SQL/PostGIS stage; geometries not offset"
export CMP_PARQUET_BASENAME="bikelanes.parquet"
export CMP_PMTILES_BASENAME="bikelanes.pmtiles"
# shellcheck source=/dev/null
source /workspace/pipelines/lib/write-comparison.sh

echo "[${PIPELINE_ID}] done"
