# OSM Processing Pipeline Benchmark

This repository benchmarks alternative OpenStreetMap processing pipelines for extracting playground-related data and producing comparable outputs.

## What this project evaluates

- End-to-end runtime and per-step runtime
- Operational complexity and maintainability
- Output completeness and validation quality
- Optional geometric enrichment support (`play_equipment_count`)

## Pipelines in scope

- `pipelines/osmium-gdal-tippecanoe`
- `pipelines/osm2pgsql-postgis-direct`
- `pipelines/osm2pgsql-postgis-prefilter`
- `pipelines/planetiler-playgrounds` (PMTiles only; no GeoParquet in this toolchain—see `validation.json` → `lacking`)

## Dataset selection

- Default: Berlin extract (`berlin-latest.osm.pbf`)
- Optional: Germany extract (`germany-latest.osm.pbf`)

The dataset is downloaded once via a prepare step and cached in `data/raw`.

## Outputs

Target outputs (see `results/methodology.md` for the full contract and declared gaps):

- PMTiles (`.pmtiles`)
- GeoParquet (`.parquet`) where the toolchain supports it
- Validation summary JSON (`validation.json`), including `lacking` when a pipeline omits an artifact

Run artifacts and timings are written to `results/runs`.

## Orchestration

The central orchestrator lives in `orchestrator` and runs all pipelines sequentially in Docker with:

- deterministic command execution
- step-level timing
- run reports and markdown summary generation

## Quick start

1. Install Bun and Docker.
2. From repository root:
   - `bun install`
   - `bun run orchestrator/src/index.ts run --dataset berlin`
3. Open:
   - `results/runs/`
   - `results/summary.md`

## Methodology and notes

- Benchmark methodology: `results/methodology.md`
- Installation/setup cost notes: `results/notes/installation-costs.md`
