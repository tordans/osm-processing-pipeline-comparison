# Findings — playgrounds benchmark (archived 2026-07)

What we learned from benchmarking 9 pipelines that extract playgrounds
(`leisure=playground` OR `playground=*`, nwr) from Berlin/Germany PBFs into GeoParquet + PMTiles.
Code: git tag `playgrounds-benchmark-final` (commit `84aee24`). Reports: [summary.md](summary.md),
[methodology.md](methodology.md); per-pipeline gists: [pipelines.md](pipelines.md).

## Why the benchmark was retired

The classification is trivial (two tag checks), so the benchmark measured I/O and toolchain overhead,
not processing capability. Tools with sophisticated rule engines (OSMnexus) showed no advantage —
osm2pgsql was sometimes faster. The successor benchmark uses tilda-geo's roads/bikelanes processing
(26+ categories, side-splitting, derivers) as a realistic workload.

## Dataset / filter semantics

- **Real playgrounds are `leisure=playground`, not `amenity=playground`.** The original filter matched
  18 objects in all of Berlin; every pipeline's enrichment path was dead code until the fix
  (commit `3ded260`). Lesson: validate the opinionated filter against real data before benchmarking.
- `osmium tags-filter` **keeps objects referenced by matches** (way nodes, relation members). Pipelines
  that export "everything in the filtered file" (GDAL) silently include non-matching tagged objects;
  a tag-level re-gate after any reference-completing prefilter is mandatory.
- osmconvert/osmfilter prefiltering is settled: the o5m conversion (Germany: 308 s total filter step)
  costs more than it saves vs `osmium tags-filter` (72 s).

## Export semantics (feature identity)

- Comparable pipelines must export **each OSM object exactly once**, keyed by (`osm_type`, `osm_id`):
  nodes→Point, open ways→LineString, closed target ways→Polygon, relations→(Multi)Polygon.
- The osm2pgsql lua originally inserted closed ways as both line and polygon → 4 572 duplicate features
  on Berlin until the export union got a `NOT EXISTS` dedup (commit `520055b`).
- `osm2pgsql as_multipolygon()` silently drops relations it cannot assemble (~29 on Germany);
  geometric recovery (ST_BuildArea over merged member lines) can rescue them but loses role semantics.
- Final convergence: osm2pgsql family 218 138, OSMnexus 218 167 (= +29 recovered relations),
  cosmo 217 640 (no relations), GDAL 218 066 (−4 `type=site` relations, unreachable layer).
  Enrichment: 103 458 / 103 478 `leisure=playground` polygons with `play_equipment_count`.

## OSMnexus (rev `1eae18d`)

- **Standalone tagged nodes are dropped upstream** — only nodes referenced by kept ways are classified.
  Fatal for POI topics. Vendored `standalone-nodes.patch` fixes it (287 → 3 723 nodes on Berlin,
  identical in both readers, matches osm2pgsql exactly). Upstream: rush42/OSMnexus#1.
- Coordinates stored as **f32** → point displacement ≤0.21 m; the 7-decimal serialization policy is
  not truly met for points. Length errors are absolute (~0.2 m/vertex), so relative errors look big
  only on meter-scale features.
- Geometry model is graph/network-centric: closed ways are LineString rings (no polygons anywhere),
  relations are `ST_LineMerge` of member ways with inner/outer roles discarded. Holes can be recovered
  via ST_BuildArea / shapely `build_area` — verified byte-equal areas across both approaches on all
  Berlin playground relations. shapely `polygonize` is the wrong tool (returns hole faces as filled polygons).
- `--output geojson` builds one in-memory FeatureCollection per topic, one feature per edge *segment* —
  needs a downstream transform and does not scale; motivated the `geojsonseq` streaming patch in the
  successor benchmark.
- Feature-level equivalence with the reference held exactly: identical ids and tag values on every
  shared feature, Berlin and Germany.
- Filter-while-reading is the tool's natural mode: an osmium prefilter in front of it is redundant
  double filtering and flatters its transform timing (pre-shrunk input). Declare `filter=null` instead.

## Timings (final Germany run, 2026-07-10)

See [summary.md](summary.md) for the full table. Highlights: cosmo single-pass 2.8–5.6 min,
OSMnexus geojson-direct 2.4 min (full 4.7 GB read, classify, export), B2 1.9 min (but 72 s of that is
osmium prefilter), planetiler 8.2 min (tiles only), B1 23 min (May; a 74 min July rerun reflected the
disk incident below). Berlin numbers in `results/runs/` history and summary.md.

## Infrastructure learnings

- **Result cache** (`orchestrator/src/pipelineCache.ts`): sha256 over pipeline dir + shared lib +
  script path + input identity; successful runs write `run-cache.json` next to outputs; unchanged
  pipelines are skipped and marked `cached` in the report. Adding a variant no longer re-runs the
  multi-hour Germany export. `--force` bypasses.
- **Docker VM disk exhaustion** looks like a Postgres crash ("server process exited abnormally" mid-COPY):
  Docker.raw is sparse with a limit far above host free space; a big `--slim` import grows it until the
  host runs dry, and the daemon wedges (unresponsive CLI, un-quittable). Remedy: force-restart daemon,
  prune build cache/volumes, keep tens of GB host headroom for Germany-scale imports.
- In-container Postgres per pipeline (no volumes) keeps runs hermetic and `--rm`-cleanable.
- tippecanoe/ogr2ogr serialization policy that made outputs comparable: GeoJSONSeq,
  `COORDINATE_PRECISION=7`, RFC7946, explicit EPSG:4326, tippecanoe detail flags 12.
