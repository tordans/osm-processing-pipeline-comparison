#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <input_pbf> [dataset_name]"
  exit 1
fi

INPUT_PBF="$1"
DATASET_NAME="${2:-berlin}"
PIPELINE_ID="osmnexus-geojson-direct"
INTERMEDIATE_DIR="/workspace/data/intermediate/${PIPELINE_ID}/${DATASET_NAME}"
OUTPUT_DIR="/workspace/data/output/${PIPELINE_ID}/${DATASET_NAME}"
TIMINGS_JSON="${OUTPUT_DIR}/step_timings.json"

mkdir -p "${INTERMEDIATE_DIR}" "${OUTPUT_DIR}"

COORD_PRECISION=7

FILTERED_PBF="${INTERMEDIATE_DIR}/filtered.osm.pbf"
NEXUS_OUT="${INTERMEDIATE_DIR}/nexus-out"
GEOJSON_IN="${NEXUS_OUT}/playgrounds.geojson"
NDJSON_OUT="${INTERMEDIATE_DIR}/playgrounds.ndjson"
PARQUET_OUT="${OUTPUT_DIR}/playgrounds.parquet"
PMTILES_OUT="${OUTPUT_DIR}/playgrounds.pmtiles"
VALIDATION_JSON="${OUTPUT_DIR}/validation.json"

echo "[pipeline-nexus-geojson] prefilter source pbf with osmium"
T0=$(date +%s%3N)
osmium tags-filter "${INPUT_PBF}" \
  nwr/amenity=playground \
  nwr/playground=* \
  -o "${FILTERED_PBF}" -O
T1=$(date +%s%3N)

echo "[pipeline-nexus-geojson] classify with osmnexus (geojson output)"
T2=$(date +%s%3N)
mkdir -p "${NEXUS_OUT}"
osmnexus "${FILTERED_PBF}" \
  --config-dir /workspace/pipelines/osmnexus-playgrounds/configs/playgrounds \
  --output geojson \
  --out-dir "${NEXUS_OUT}" \
  --threads 0
T3=$(date +%s%3N)

echo "[pipeline-nexus-geojson] transform geojson to ndjson (merge segments, polygonize)"
T4=$(date +%s%3N)
python3 - "${GEOJSON_IN}" "${NDJSON_OUT}" "${COORD_PRECISION}" <<'PY'
import json
import sys

import shapely
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, mapping, shape
from shapely.ops import linemerge, unary_union

geojson_path, ndjson_path, precision_s = sys.argv[1:4]
precision = int(precision_s)


def feature_kind(props: dict) -> str:
    # The `id` property is "node/123" / "way/123" / "relation/123" — unambiguous,
    # unlike bare osm_id (node/way/relation id spaces overlap in OSM).
    return props.get("id", "").split("/", 1)[0]


def round_coord(value: float) -> float:
    return round(value, precision)


def round_geometry(geom):
    gtype = geom.geom_type
    if gtype == "Point":
        x, y = geom.x, geom.y
        return Point(round_coord(x), round_coord(y))
    if gtype == "LineString":
        return LineString([(round_coord(x), round_coord(y)) for x, y in geom.coords])
    if gtype == "Polygon":
        exterior = [(round_coord(x), round_coord(y)) for x, y in geom.exterior.coords]
        holes = [
            [(round_coord(x), round_coord(y)) for x, y in ring.coords]
            for ring in geom.interiors
        ]
        return Polygon(exterior, holes)
    if gtype == "MultiPolygon":
        return MultiPolygon([round_geometry(part) for part in geom.geoms])
    if gtype == "MultiLineString":
        return type(geom)([round_geometry(part) for part in geom.geoms])
    return geom


def base_props(props: dict, kind: str) -> dict:
    return {
        "osm_id": int(props["osm_id"]),
        "osm_type": kind or "way",
        "name": props.get("name"),
        "amenity": props.get("amenity"),
        "playground": props.get("playground"),
        "play_equipment_count": None,
    }


def write_feature(out, geom, props: dict) -> None:
    rounded = round_geometry(geom)
    feature = {
        "type": "Feature",
        "geometry": mapping(rounded),
        "properties": props,
    }
    out.write(json.dumps(feature, ensure_ascii=False, separators=(",", ":")))
    out.write("\n")


def way_geometry(segments: list[tuple[int, list]]) -> object | None:
    # Edge segments are contiguous pieces of one way; stitching by seg_idx
    # reproduces the original way exactly (end of segment i == start of i+1).
    coords: list = []
    for _, seg in sorted(segments, key=lambda item: item[0]):
        coords.extend(seg if not coords else seg[1:])
    if len(coords) < 2:
        return None
    if coords[0] == coords[-1] and len(coords) >= 4:
        return Polygon(coords)
    return LineString(coords)


def relation_geometry(segments: list[tuple[int, list]]) -> object | None:
    lines = [
        LineString(coords)
        for _, coords in sorted(segments, key=lambda item: item[0])
        if len(coords) >= 2
    ]
    if not lines:
        return None
    merged = linemerge(lines)
    if merged.is_empty:
        return None
    # ST_BuildArea semantics: assemble rings into areas, treating enclosed
    # rings as holes (shapely polygonize would return holes as filled faces).
    built = shapely.build_area(unary_union(lines))
    if not built.is_empty:
        return built
    return merged


with open(geojson_path, encoding="utf-8") as f:
    collection = json.load(f)

node_features: list[tuple[dict, dict]] = []
way_segments: dict[int, list[tuple[int, list]]] = {}
relation_segments: dict[int, list[tuple[int, list]]] = {}
props_by_key: dict[tuple[str, int], dict] = {}

for feature in collection.get("features", []):
    geom = feature.get("geometry") or {}
    props = feature.get("properties") or {}
    if "osm_id" not in props:
        continue
    osm_id = int(props["osm_id"])
    kind = feature_kind(props)
    props_by_key[(kind, osm_id)] = props

    if geom.get("type") == "Point":
        node_features.append((props, geom))
        continue
    if geom.get("type") != "LineString":
        continue
    coords = geom.get("coordinates") or []
    seg_idx = int(props.get("seg_idx", 0))
    if kind == "relation":
        relation_segments.setdefault(osm_id, []).append((seg_idx, coords))
    else:
        way_segments.setdefault(osm_id, []).append((seg_idx, coords))

with open(ndjson_path, "w", encoding="utf-8") as out:
    for props, geom in node_features:
        point = shape(geom)
        write_feature(out, point, base_props(props, "node"))

    for osm_id, segments in way_segments.items():
        geom = way_geometry(segments)
        if geom is None:
            continue
        props = props_by_key.get(("way", osm_id), {"osm_id": osm_id})
        write_feature(out, geom, base_props(props, "way"))

    for osm_id, segments in relation_segments.items():
        geom = relation_geometry(segments)
        if geom is None:
            continue
        props = props_by_key.get(("relation", osm_id), {"osm_id": osm_id})
        write_feature(out, geom, base_props(props, "relation"))
PY
T5=$(date +%s%3N)

echo "[pipeline-nexus-geojson] export geoparquet from ndjson (geopandas/pyarrow; GDAL lacks Parquet driver)"
T6=$(date +%s%3N)
python3 - <<PY
import geopandas as gpd

src = "${NDJSON_OUT}"
dst = "${PARQUET_OUT}"
gdf = gpd.read_file(src, driver="GeoJSONSeq")
gdf.to_parquet(dst, index=False)
PY
T7=$(date +%s%3N)

echo "[pipeline-nexus-geojson] build pmtiles"
T8=$(date +%s%3N)
tippecanoe -f -P -zg --projection=EPSG:4326 -l playgrounds \
  --full-detail=12 --low-detail=12 --minimum-detail=12 \
  -o "${PMTILES_OUT}" "${NDJSON_OUT}"
T9=$(date +%s%3N)

echo "[pipeline-nexus-geojson] run validations"
T10=$(date +%s%3N)
python3 - <<'PY' "${NDJSON_OUT}" "${PARQUET_OUT}" "${PMTILES_OUT}" "${VALIDATION_JSON}"
import json
import os
import sys

ndjson_path, parquet_path, pmtiles_path, validation_path = sys.argv[1:]
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
    "pipeline": "osmnexus-geojson-direct",
    "geojson_coordinate_precision": 7,
    "feature_count": line_count,
    "named_feature_count": name_count,
    "parquet_bytes": os.path.getsize(parquet_path) if os.path.exists(parquet_path) else 0,
    "pmtiles_bytes": os.path.getsize(pmtiles_path) if os.path.exists(pmtiles_path) else 0,
    "enrichment": {"status": "not_supported"},
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
T11=$(date +%s%3N)

export CMP_FILTER_MS="$((T1 - T0))"
export CMP_CLEAN_TRANSFORM_MS="$(( (T3 - T2) + (T5 - T4) ))"
export CMP_EXPORT_GEOPARQUET_MS="$((T7 - T6))"
export CMP_EXPORT_PMTILES_MS="$((T9 - T8))"
export CMP_SQL_POSTPROCESS_MS="null"
export CMP_VALIDATE_MS="$((T11 - T10))"
export CMP_TOTAL_IN_CONTAINER_MS="$((T11 - T0))"
export REQ_GENERATE_GEOPARQUET_MATCHED="true"
export REQ_GENERATE_PMTILES_MATCHED="true"
export REQ_FILTER_CLEAN_CONFIRMED_MATCHED="true"
export REQ_SQL_POSTPROCESS_MATCHED="false"
export REQ_SQL_POSTPROCESS_REASON="Pipeline has no SQL/PostGIS stage"
# shellcheck source=/dev/null
source /workspace/pipelines/lib/write-comparison.sh

echo "[pipeline-nexus-geojson] done"
