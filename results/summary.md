# Benchmark Summary

Generated from run artifact: `/Users/tordans/Development/OSM/osm-processing-pipeline-comparison/results/runs/run-2026-04-10T13-22-05-206Z-germany.json`

- **Run ID:** `2026-04-10T13-22-05-206Z`
- **Dataset:** `germany`
- **Input:** `/Users/tordans/Development/OSM/osm-processing-pipeline-comparison/data/raw/germany-latest.osm.pbf`
- **Window:** `2026-04-10T13:22:05.206Z` → `2026-04-10T13:39:34.019Z`
- **Pipelines OK:** 4 / 4

## How to read this table

- **Build** is `docker build` time on the host (one-time per image change).
- **Container** is wall time for `docker run` (includes download/cache effects on first use).
- **In-container (script)** comes from each pipeline’s `step_timings.json` and reflects work inside the container only.
- **Val OK** reflects `validation.json` → `ok` from each pipeline run.

## Latest run — timings and outputs

| Pipeline | Status | Val OK | Build | Container | Total (build+run) | In-container (script) | Features | Parquet | PMTiles | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| osm2pgsql-postgis-direct | ok | yes | 1.06s | 903.58s | 904.64s | 900.06s | 86303 | 3.67 MiB | 7.98 MiB | — |
| osm2pgsql-postgis-prefilter | ok | yes | 2.04s | 39.70s | 41.74s | 38.99s | 86303 | 3.67 MiB | 7.98 MiB | — |
| osmium-gdal-tippecanoe | ok | yes | 3.07s | 33.70s | 36.77s | 33.45s | 86738 | 4.15 MiB | 10.21 MiB | — |
| planetiler-playgrounds | ok | yes | 1.42s | 64.01s | 65.42s | 63.76s | — | — | 12.98 MiB | — |

## vs osm2pgsql + Osmium prefilter (B2 reference)

Baseline: **osm2pgsql-postgis-prefilter** (Osmium `tags-filter` + osm2pgsql → PostGIS → exports). Other pipelines show wall-time deltas and relative duration vs that baseline.

| Pipeline | Total (build+run) vs B2 | Container vs B2 | In-container (script) vs B2 |
| --- | --- | --- | --- |
| osm2pgsql-postgis-prefilter | baseline | baseline | baseline |
| osm2pgsql-postgis-direct | 862.90s slower; 2067.5% more time than reference | 863.88s slower; 2176.1% more time than reference | 861.06s slower; 2208.1% more time than reference |
| osmium-gdal-tippecanoe | 4.96s faster; 11.9% less time than reference | 6.00s faster; 15.1% less time than reference | 5.55s faster; 14.2% less time than reference |
| planetiler-playgrounds | 23.68s slower; 56.7% more time than reference | 24.31s slower; 61.2% more time than reference | 24.76s slower; 63.5% more time than reference |

### Comparable in-container steps (same `step_timings.json` keys as B2)

Only steps emitted under the same name in B2 and another pipeline; empty cells mean that pipeline has no matching step.

| Step | osm2pgsql-postgis-direct | osmium-gdal-tippecanoe | planetiler-playgrounds |
| --- | --- | --- | --- |
| export_geoparquet | 0.19s slower; 15.5% more time than reference | 0.42s slower; 33.6% more time than reference | — |
| export_pmtiles | 0.10s slower; 2.6% more time than reference | 0.06s faster; 1.7% less time than reference | — |
| validate | 0.00s slower; 0.7% more time than reference | 0.01s faster; 4.7% less time than reference | 0.11s faster; 73.2% less time than reference |

## Cross-pipeline sanity (feature counts)

- **osmium-gdal-tippecanoe:** 86738 features
- **osm2pgsql (B1, representative):** 86303 features
- **Delta:** 435 (0.5% vs B1). Different OSM-to-geometry assembly (GDAL OSM driver vs osm2pgsql flex) commonly yields small count differences; B1 and B2 should match when the extract is equivalent.


## Per-pipeline outputs and operations

Single-file **tile delivery** means `playgrounds.pmtiles` (HTTP-range-friendly archive). **Analysis format** means `playgrounds.parquet` (GeoParquet). Times come from each run’s `step_timings.json` where a matching step key exists.

### osm2pgsql-postgis-direct

- **PMTiles:** Yes — osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 3.86s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 1.44s (export_geoparquet)
- **Server / ops:** PostgreSQL + PostGIS + osm2pgsql + SQL post-process. Higher ops surface (extensions, tuning, disk for DB).
- **CI / static hosting:** Docker on GHA: Berlin is typical; Germany stresses RAM/disk and runtime. Same Netlify note: artifact hosting only.
- **Lacking (declared):** —

### osm2pgsql-postgis-prefilter

- **PMTiles:** Yes — Osmium `tags-filter` → osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 3.76s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 1.25s (export_geoparquet)
- **Server / ops:** Same as direct variant plus Osmium prefilter step; smaller import, still full Postgres lifecycle in the container.
- **CI / static hosting:** Same runner considerations as B1; prefilter reduces import time but still needs Postgres in Docker.
- **Lacking (declared):** —

### osmium-gdal-tippecanoe

- **PMTiles:** Yes — Osmium `tags-filter` → GDAL GeoJSONSeq (WGS84, 7 dp) → tippecanoe → `playgrounds.pmtiles`. — *step time:* 3.70s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 1.67s (export_geoparquet)
- **Server / ops:** No database. Stack: Osmium, GDAL, tippecanoe, Python/GeoPandas. Lowest moving parts for a one-off server job.
- **CI / static hosting:** Docker on GitHub Actions: usually fine for Berlin; Germany needs enough disk/RAM on the runner. Netlify/Vercel: use only to **host** static `.pmtiles`/`.parquet` after CI builds them — not to run this extract.
- **Lacking (declared):** —

### planetiler-playgrounds

- **PMTiles:** Yes — Planetiler custommap YAML (single JVM pass) → native PMTiles writer → `playgrounds.pmtiles`. — *step time:* 63.71s (planetiler_pmtiles)
- **GeoParquet:** No — Not supported — Planetiler does not emit Parquet; this benchmark does not add a second OSM pass to synthesize it. — *step time:* — (—)
- **Server / ops:** Single JVM + `planetiler.jar`; heap scales with extract size (~0.5× PBF recommended, 1 GiB floor in script). No DB.
- **CI / static hosting:** Docker on GHA: set `PLANETILER_JAVA_OPTS` if the default heap hits runner limits. Germany may need a larger runner. Netlify: host outputs only.
- **Lacking (declared):** geoparquet, play_equipment_enrichment

## B1 vs B2 (prefilter vs direct osm2pgsql)

- **End-to-end (build + container wall):** B2 is 862.90s faster than B1.
- **B2 osmium prefilter:** 29.70s
- **osm2pgsql import (B2 − B1):** -892.25s
- **In-container script total (B2 − B1):** -861.06s (from each pipeline’s `step_timings.json`, excludes image build)

## Failures

None.

## Installation cost notes

Image build time dominates the first run; for recurring benchmarks, compare **In-container (script)** and **Container** after images are built. Setup/install cost is documented in `results/notes/installation-costs.md` (not part of processing totals).

## Raw artifacts

- Per-pipeline: `data/output/<pipeline-id>/<dataset>/validation.json` and `step_timings.json`
- Full run: `results/runs/*.json`
