# Benchmark Methodology — TILDA roads/bikelanes processing

## Goal

Compare OSM processing pipelines on a **realistic classification workload**: tilda-geo's
`roads_bikelanes` topic — 26 bikelane categories + 33 road categories, side-splitting of ways into
left/right objects, lifecycle transforms, sanitizers, and multi-level attribute derivation
(surface/smoothness/oneway/traffic modes).

The predecessor playground benchmark (archived: [archive/playgrounds-2026-07/](archive/playgrounds-2026-07/))
was too simple — two tag checks — so it measured I/O and toolchain overhead rather than processing
capability. This benchmark exercises the part that distinguishes the tools.

## The contenders

Two implementations of the same processing, one per engine:

- **osm2pgsql flex + Lua** — tilda-geo's production code
  ([FixMyBerlin/tilda-geo](https://github.com/FixMyBerlin/tilda-geo) `processing/topics/`), vendored
  unmodified except one marked adaptation (pseudo-tag CSV enrichment stubbed; see Deviations).
- **OSMnexus** — Rust streaming classifier ([rush42/OSMnexus](https://github.com/rush42/OSMnexus),
  pinned `e716644`, AGPL-3.0) with its bundled `configs/tilda` (a JSON-rules reimplementation of the
  same topic), vendored verbatim and complete.

## Pipelines

| id | engine | flow |
| --- | --- | --- |
| `roads-bikelanes-osm2pgsql-prefilter-osmium` | osm2pgsql | osmium `w/highway` prefilter (tilda production setup) → flex import → SQL offset → exports |
| `roads-bikelanes-osm2pgsql-direct` | osm2pgsql | raw PBF straight into flex import (`filter=null`) → SQL offset → exports |
| `roads-bikelanes-osmnexus-postgis` | OSMnexus | raw PBF, filters while reading (`filter=null`) → PostGIS → SQL offset (adapted) → exports |
| `roads-bikelanes-osmnexus-geojsonseq` | OSMnexus | raw PBF, filters while reading → streamed NDJSON → exports directly (no DB, no offset) |

An osmconvert/osmfilter prefilter variant is intentionally absent — the playground benchmark settled
that the o5m conversion costs more than the filtering saves (Germany: 308 s vs osmium's 72 s).

## Fairness rules

- Same input dataset (Berlin / Germany Geofabrik extracts), same machine, Docker, sequential runs.
- Each tool runs its **natural workflow**: osm2pgsql keeps tilda's osmium prefilter (and a direct
  variant); OSMnexus filters while reading — no redundant prefilter in front of it.
- Shared serialization: GeoJSONSeq, `COORDINATE_PRECISION=7`, RFC7946, EPSG:4326; identical
  tippecanoe flags (`-zg`, detail 12, `--drop-densest-as-needed`, layer `bikelanes`).
- Output contract per pipeline: `bikelanes.parquet` + `bikelanes.pmtiles` from the `bikelanes`
  table/stream (export properties: `id`, `osm_id`, `category`, `name`, `oneway`, `surface`,
  `smoothness`, `width`, `side`); `roads` participates via row/category counts in `validation.json`.
  Roads counts are informational only: the implementations slice the road taxonomy differently
  (tilda splits `roads` / `roadsPathClasses` / `bikeSuitability`; the OSMnexus roads topic keeps one
  table with its own category set), so roads row counts are not directly comparable — Berlin:
  tilda 107 104 + 162 921 path classes vs OSMnexus 344 676.
- Pipelines that cannot perform a stage declare it (`REQ_SQL_POSTPROCESS_MATCHED=false` for the
  no-DB variant: geometries are not offset).

## The SQL stage (geometry offset)

tilda-geo's post-import step (`2_move_bikelanes.sql`) offsets sided cycling infrastructure away from
the road center line — `ST_OffsetCurve` in EPSG:5243 by `side_sign × road_width/2`, then `ST_Reverse`
to restore per-side line direction. The step itself is cheap; its significance is that it **requires a
PostGIS path** for those segments.

- osm2pgsql pipelines: verbatim tilda SQL; the `offset` value is computed in Lua during import.
- OSMnexus PostGIS pipeline: the config cannot do arithmetic, so the offset is computed in SQL from
  `_side` sign × tilda's road-width defaults keyed by the derived road class (parent width tags are
  not available). Same OffsetCurve/Reverse. Timing attribution differs slightly (offset computation
  in `sqlPostprocess` instead of `cleanTransform`); offset magnitudes may differ where width tags
  existed on the parent road.

## Parity (soft), measured on Berlin

`scripts/compare-bikelanes.py` compares two bikelanes exports (category counts with case
normalization, id-set diff, attribute agreement, geometry length deltas). The OSMnexus tilda config
was built from an older tilda-geo state, so **small drift is expected and accepted**; the benchmark
compares processing performance, not implementation identity.

Measured (osm2pgsql-prefilter vs osmnexus-postgis, Berlin):

- id-set drift **0.35%** (38 898 vs 39 027 features; divergence concentrated in the
  `needsClarification` catch-all)
- **category agreement 100.00%** on all 38 895 shared ids; `oneway` and `side`: 0 mismatches
- known skew: `smoothness` differs on 19% of shared ids (deriver fallback chains evolved in
  tilda-geo; mostly values where the older chain yields none); 4 `surface` cases where tilda's
  sanitizer drops junk values that OSMnexus keeps
- offset geometry length differences: p95 = 1.9% (width-default vs parent-width, see above)

Germany scale confirms the picture: id-set drift 0.83% (993 139 vs 1 000 109 features), category
mismatches 0.01%, `side`/`oneway` ≈ 0, smoothness at the known ~11% deriver skew.

## Deviations from production (all marked in code)

1. **Pseudo-tag enrichment stubbed** (osm2pgsql side): tilda production enriches `_is_sidepath` /
   `_in_settlement_area` from TS-generated CSVs; stubbed to no-ops for standalone runnability.
   OSMnexus has no equivalent (tags-only engine), so both sides run tag-only logic.
2. **Offset computed in SQL** for the OSMnexus PostGIS variant (see above).
3. **OSMnexus patches** (vendored, applied at image build):
   `standalone-nodes.patch` (emit standalone classified nodes; upstream
   [rush42/OSMnexus#1](https://github.com/rush42/OSMnexus/issues/1); a no-op for these way-only
   topics, kept for consistency) and `geojsonseq-output.patch` (streaming newline-delimited GeoJSON
   with one whole-way feature per tag row — upstream's `--output geojson` builds one in-memory
   FeatureCollection with per-edge-segment features, which neither streams nor scales).

## Measurements & infrastructure

Unchanged from the previous benchmark: per-step timings (`filter`, `cleanTransform`,
`sqlPostprocess`, `exportGeoParquet`, `exportPmtiles`, `validate`) via `comparison.json`
(`pipelines/lib/write-comparison.sh`); orchestrator (`bun run orchestrate[:germany]`) with docker
build/run wall times; **result cache** skips pipelines whose directory + input fingerprint is
unchanged (reused entries marked in the summary); background runner for Germany
(`bun run run:background germany`). `results/summary.md` is regenerated from the latest run.

## Failure criteria

- missing required artifacts for the pipeline's declared contract
- zero bikelanes features, or missing categories (fewer than 20 of the 26)
- failed validation commands
- unexplained parity drift beyond low single digits
