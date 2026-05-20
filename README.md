# OSM Processing Pipeline Benchmark

This repository benchmarks alternative OpenStreetMap processing pipelines for extracting playground-related data and producing comparable outputs.

## Why this benchmark exists

Many OpenStreetMap community projects need more than a raw extract. They need a repeatable way to turn OSM data into a small, documented, **opinionated dataset** for a specific use case. This repository uses playground data as the example: it compares processing pipelines that can regularly transform an OSM PBF extract into artifacts that are ready for maps and analysis.

The target is **regular, not minute-by-minute processing**. A good pipeline should be able to run about once per day or once per week, ideally in infrastructure that community maintainers can already use (for free), such as GitHub Actions or a similar CI environment.

### Opinionated Dataset

OSM data becomes more detailed and more complex every day. That creates a need for community-driven, open source interpretations of OSM data for specific use cases. In an ideal setup, community projects can use the same processing logic to create both vector maps (`PMTiles`) and analysis-ready data (`GeoParquet`).

This repository encourages **opinionated datasets** for specific domains: datasets that document and implement clear answers to questions like _Which OSM tags, keys, and values are relevant?_, _How should different tag combinations be interpreted?_, _Which derived attributes should be added for the map or analysis use case?_, and _Where does raw OSM detail need to be normalized, grouped, or counted?_

For playgrounds, a simple example is `play_equipment_count`: individual play equipment features can be counted for each playground area, so a map or analysis can show which playgrounds have the most mapped equipment. That small enrichment step is part of the dataset definition, not just a rendering trick.

### Two Outputs, One Dataset

The benchmark focuses on producing two artifacts from the same interpreted source data:

- **PMTiles** for rendering maps.
- **GeoParquet** for data analysis.

These outputs should describe the same playground dataset as closely as possible. They are different physical formats for different consumers, not separate interpretations of OSM.

### What the current results show

The current comparison evaluates pipelines built around tools such as `Osmium`, `osm2pgsql flex`, `PostGIS`, `GDAL`, `GeoPandas`, `tippecanoe`, `Planetiler`, and `cosmo`. For the current best pipeline and the detailed pipeline results, see [`results/summary.md`](results/summary.md).

At the moment, the `osm2pgsql-postgis-prefilter` pipeline is the main PostGIS reference pipeline: it prefilters the source OSM PBF with `osmium tags-filter`, imports the reduced extract with `osm2pgsql flex`, runs SQL enrichment in `PostGIS`, and exports both `GeoParquet` and `PMTiles`. It offers strong flexibility for opinionated processing because SQL postprocessing can express domain-specific enrichment clearly. The benchmark also shows where this traditional toolchain is not yet optimized for directly producing small, static `PMTiles` and `GeoParquet` files as final artifacts.

## What this project evaluates

- End-to-end runtime and per-step runtime
- Operational complexity and maintainability
- Output completeness and validation quality
- Optional geometric enrichment support (`play_equipment_count`)

## Pipelines in scope

- `pipelines/osmium-gdal-tippecanoe`
- `pipelines/osm2pgsql-postgis-direct`
- `pipelines/osm2pgsql-postgis-prefilter`
- `pipelines/osm2pgsql-postgis-prefilter-osmfilter` (same as B2, but `osmconvert` + `osmfilter` instead of Osmium — compare prefilter vs B2)
- `pipelines/planetiler-playgrounds` (PMTiles only; no GeoParquet in this toolchain—see `validation.json` → `lacking`)
- `pipelines/cosmo-playgrounds` — two variants: **dual-pass** (native GeoParquet + second cosmo read for tiles) and **single-pass** (one cosmo read + GDAL GeoJSONSeq + GeoPandas Parquet + tippecanoe); see summary section *Cosmo dual-pass vs single-pass*

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
