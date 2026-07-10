# OSM Processing Pipeline Benchmark

This repository benchmarks alternative OpenStreetMap processing pipelines on a realistic classification workload: tilda-geo's **roads/bikelanes** processing (26 bikelane + 33 road categories, side-splitting, attribute derivation), implemented once in `osm2pgsql flex + Lua` (the production original) and once in `OSMnexus` (a Rust streaming classifier with JSON rules).

> An earlier iteration benchmarked a much simpler playground extraction across 9 pipelines (incl. GDAL, Planetiler, cosmo). It turned out to measure I/O rather than processing capability and is archived with all findings under [`results/archive/playgrounds-2026-07/`](results/archive/playgrounds-2026-07/).

## Why this benchmark exists

Many OpenStreetMap community projects need more than a raw extract. They need a repeatable way to turn OSM data into a small, documented, **opinionated dataset** for a specific use case. This repository uses playground data as the example: it compares processing pipelines that can regularly transform an OSM PBF extract into artifacts that are ready for maps and analysis.

The target is **regular, not minute-by-minute processing**. A good pipeline should be able to run about once per day or once per week, ideally in infrastructure that community maintainers can already use (for free), such as GitHub Actions or a similar CI environment.

### Opinionated Dataset

OSM data becomes more detailed and more complex every day. That creates a need for community-driven, open source interpretations of OSM data for specific use cases. In an ideal setup, community projects can use the same processing logic to create both vector maps (`PMTiles`) and analysis-ready data (`GeoParquet`).

This repository encourages **opinionated datasets** for specific domains: datasets that document and implement clear answers to questions like _Which OSM tags, keys, and values are relevant?_, _How should different tag combinations be interpreted?_, _Which derived attributes should be added for the map or analysis use case?_, and _Where does raw OSM detail need to be normalized, grouped, or counted?_

The roads/bikelanes dataset is exactly such an interpretation: raw `highway` ways become classified bikelane objects (protected cycleway, advisory lane, shared bus lane, …), split into left/right sides where the infrastructure is mapped on the road center line, enriched with derived attributes (`surface`, `smoothness`, `oneway`) and geometrically offset from the center line for rendering.

### Two Outputs, One Dataset

The benchmark focuses on producing two artifacts from the same interpreted source data:

- **PMTiles** for rendering maps.
- **GeoParquet** for data analysis.

These outputs should describe the same playground dataset as closely as possible. They are different physical formats for different consumers, not separate interpretations of OSM.

### What the current results show

See [`results/summary.md`](results/summary.md) for the latest run and [`results/methodology.md`](results/methodology.md) for the full contract, fairness rules, and measured parity between the two implementations (category agreement 100% on shared ids, 0.35% id-set drift on Berlin).

## What this project evaluates

- End-to-end runtime and per-step runtime on a realistic classification workload
- Operational complexity and maintainability (database vs no-database paths)
- Output completeness and cross-implementation parity
- The PostGIS-dependent enrichment step (geometric offset of sided bikelanes)

## Pipelines in scope

- `pipelines/roads-bikelanes-osm2pgsql` — tilda-geo's production Lua, two variants: **prefilter-osmium** (tilda's production setup) and **direct** (raw PBF into osm2pgsql)
- `pipelines/roads-bikelanes-osmnexus` — OSMnexus with its bundled tilda config, two variants: **postgis** (DB + SQL offset) and **geojsonseq** (streamed NDJSON straight to exports, no database)

## Dataset selection

- Default: Berlin extract (`berlin-latest.osm.pbf`)
- Optional: Germany extract (`germany-latest.osm.pbf`)

The dataset is downloaded once via a prepare step and cached in `data/raw`.

## Outputs

Target outputs (see `results/methodology.md` for the full contract and declared gaps):

- PMTiles (`.pmtiles`)
- GeoParquet (`.parquet`) where the toolchain supports it
- Validation summary JSON (`validation.json`), including `lacking` when a pipeline omits an artifact

Each pipeline run writes a canonical `comparison.json` (same schema for all pipelines) under `data/output/<pipeline-id>/<dataset>/`. The summary report reads only these files plus orchestrator wall-clock timings.

Run artifacts are written to `results/runs`.

## Orchestration

The central orchestrator lives in `orchestrator` and runs all pipelines sequentially in Docker with:

- deterministic command execution
- step-level timing
- run reports and markdown summary generation

## Quick start

1. Install Bun and Docker.
2. From repository root:
   - `bun install`
   - `bun run orchestrate` (Berlin)
   - `bun run orchestrate:germany` (Germany full extract)
3. Open:
   - `results/runs/`
   - `results/summary.md`

## Overnight / long runs (Germany)

For multi-hour runs, use the background wrapper and poll status without streaming logs:

```bash
bun run prepare:germany
bun run run:background germany
bun run status:benchmark germany   # repeat; reads PID + latest run artifact
```

Logs: `results/logs/benchmark-germany-<timestamp>.log`. Stop a run with `kill $(cat results/runs/benchmark-germany.pid)`.

## Methodology and notes

- Benchmark methodology: `results/methodology.md`
- Installation/setup cost notes: `results/notes/installation-costs.md`
