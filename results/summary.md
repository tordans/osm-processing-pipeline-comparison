# Benchmark Summary

Generated from run artifact: `/Users/tordans/Development/OSM/osm-processing-pipeline-comparison/results/runs/run-2026-04-11T13-31-17-662Z-germany.json`

- **Run ID:** `2026-04-11T13-31-17-662Z`
- **Dataset:** `germany`
- **Input:** `/Users/tordans/Development/OSM/osm-processing-pipeline-comparison/data/raw/germany-latest.osm.pbf`
- **Window:** `2026-04-11T13:31:17.662Z` → `2026-04-11T13:55:01.961Z`
- **Pipelines OK:** 5 / 5

## How to read this table

- **Build** is `docker build` time on the host (one-time per image change).
- **Container** is wall time for `docker run` (includes download/cache effects on first use).
- **In-container (script)** comes from each pipeline’s `step_timings.json` and reflects work inside the container only.
- **Val OK** reflects `validation.json` → `ok` from each pipeline run.

## Latest run — timings and outputs

| Pipeline | Status | Val OK | Build | Container | Total (build+run) | In-container (script) | Features | Parquet | PMTiles | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| osm2pgsql-postgis-direct | ok | yes | 0.57s | 1058.73s | 1059.30s | 1053.78s | 86303 | 3.67 MiB | 7.98 MiB | — |
| osm2pgsql-postgis-prefilter | ok | yes | 1.57s | 45.34s | 46.92s | 44.55s | 86303 | 3.67 MiB | 7.98 MiB | — |
| osm2pgsql-postgis-prefilter-osmfilter | ok | yes | 45.25s | 158.78s | 204.03s | 157.73s | 86303 | 3.67 MiB | 7.98 MiB | — |
| osmium-gdal-tippecanoe | ok | yes | 0.54s | 39.62s | 40.15s | 39.33s | 86738 | 4.15 MiB | 10.21 MiB | — |
| planetiler-playgrounds | ok | yes | 1.49s | 72.25s | 73.75s | 71.92s | — | — | 12.98 MiB | — |

## vs osm2pgsql + Osmium prefilter (B2 reference)

Baseline: **osm2pgsql-postgis-prefilter** (Osmium `tags-filter` + osm2pgsql → PostGIS → exports). Other pipelines show wall-time deltas and relative duration vs that baseline.

| Pipeline | Total (build+run) vs B2 | Container vs B2 | In-container (script) vs B2 |
| --- | --- | --- | --- |
| osm2pgsql-postgis-prefilter | baseline | baseline | baseline |
| osm2pgsql-postgis-direct | 1012.38s slower; 2157.8% more time than reference | 1013.38s slower; 2234.8% more time than reference | 1009.22s slower; 2265.2% more time than reference |
| osm2pgsql-postgis-prefilter-osmfilter | 157.11s slower; 334.9% more time than reference | 113.43s slower; 250.1% more time than reference | 113.17s slower; 254.0% more time than reference |
| osmium-gdal-tippecanoe | 6.77s faster; 14.4% less time than reference | 5.73s faster; 12.6% less time than reference | 5.22s faster; 11.7% less time than reference |
| planetiler-playgrounds | 26.83s slower; 57.2% more time than reference | 26.91s slower; 59.3% more time than reference | 27.36s slower; 61.4% more time than reference |

### Comparable in-container steps (same `step_timings.json` keys as B2)

Only steps emitted under the same name in B2 and another pipeline; empty cells mean that pipeline has no matching step.

| Step | osm2pgsql-postgis-direct | osm2pgsql-postgis-prefilter-osmfilter | osmium-gdal-tippecanoe | planetiler-playgrounds |
| --- | --- | --- | --- | --- |
| export_geoparquet | 0.47s slower; 34.6% more time than reference | 0.19s slower; 14.2% more time than reference | 0.35s slower; 25.5% more time than reference | — |
| export_pmtiles | 0.18s slower; 4.4% more time than reference | 0.00s faster; 0.0% less time than reference | 0.04s slower; 1.0% more time than reference | — |
| validate | 0.01s faster; 3.6% less time than reference | 0.01s faster; 6.6% less time than reference | 0.02s faster; 13.2% less time than reference | 0.11s faster; 65.9% less time than reference |

## B2 vs osmfilter prefilter (Osmium vs osmctools)

Same downstream steps as B2; only the prefilter differs: **B2** uses Osmium `tags-filter` on PBF; **osmfilter pipeline** uses `osmconvert` (full PBF→`.o5m`) then `osmfilter` (see [osmium-tool#253](https://github.com/osmcode/osmium-tool/issues/253)).

- **B2 prefilter (Osmium):** 34.59s
- **osmfilter pipeline prefilter (total):** 147.44s
  - *split:* `osmconvert` 105.78s + `osmfilter` 41.37s
- **Prefilter ratio (osmfilter total ÷ B2 Osmium):** 4.26×

## Cross-pipeline sanity (feature counts)

- **osmium-gdal-tippecanoe:** 86738 features
- **osm2pgsql (B1, representative):** 86303 features
- **Delta:** 435 (0.5% vs B1). Different OSM-to-geometry assembly (GDAL OSM driver vs osm2pgsql flex) commonly yields small count differences; B1 and B2 should match when the extract is equivalent.


## Per-pipeline outputs and operations

Single-file **tile delivery** means `playgrounds.pmtiles` (HTTP-range-friendly archive). **Analysis format** means `playgrounds.parquet` (GeoParquet). Times come from each run’s `step_timings.json` where a matching step key exists.

### osm2pgsql-postgis-direct

- **PMTiles:** Yes — osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 4.15s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 1.83s (export_geoparquet)
- **Server / ops:** PostgreSQL + PostGIS + osm2pgsql + SQL post-process. Higher ops surface (extensions, tuning, disk for DB).
- **CI / static hosting:** Docker on GHA: Berlin is typical; Germany stresses RAM/disk and runtime. Same Netlify note: artifact hosting only.
- **Lacking (declared):** —

### osm2pgsql-postgis-prefilter

- **PMTiles:** Yes — Osmium `tags-filter` → osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 3.97s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 1.36s (export_geoparquet)
- **Server / ops:** Same as direct variant plus Osmium prefilter step; smaller import, still full Postgres lifecycle in the container.
- **CI / static hosting:** Same runner considerations as B1; prefilter reduces import time but still needs Postgres in Docker.
- **Lacking (declared):** —

### osm2pgsql-postgis-prefilter-osmfilter

- **PMTiles:** Yes — `osmconvert` (PBF→o5m) → osmfilter → osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 3.97s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 1.55s (export_geoparquet)
- **Server / ops:** Same as B2 but prefilter is osmconvert + osmfilter (no Osmium); needs extra disk for full `.o5m` before filtering.
- **CI / static hosting:** Same as B2; Germany needs enough disk for a full `.o5m` copy during `osmconvert` (osmfilter requires a seekable file).
- **Lacking (declared):** —

### osmium-gdal-tippecanoe

- **PMTiles:** Yes — Osmium `tags-filter` → GDAL GeoJSONSeq (WGS84, 7 dp) → tippecanoe → `playgrounds.pmtiles`. — *step time:* 4.01s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 1.71s (export_geoparquet)
- **Server / ops:** No database. Stack: Osmium, GDAL, tippecanoe, Python/GeoPandas. Lowest moving parts for a one-off server job.
- **CI / static hosting:** Docker on GitHub Actions: usually fine for Berlin; Germany needs enough disk/RAM on the runner. Netlify/Vercel: use only to **host** static `.pmtiles`/`.parquet` after CI builds them — not to run this extract.
- **Lacking (declared):** —

### planetiler-playgrounds

- **PMTiles:** Yes — Planetiler custommap YAML (single JVM pass) → native PMTiles writer → `playgrounds.pmtiles`. — *step time:* 71.86s (planetiler_pmtiles)
- **GeoParquet:** No — Not supported — Planetiler does not emit Parquet; this benchmark does not add a second OSM pass to synthesize it. — *step time:* — (—)
- **Server / ops:** Single JVM + `planetiler.jar`; heap scales with extract size (~0.5× PBF recommended, 1 GiB floor in script). No DB.
- **CI / static hosting:** Docker on GHA: set `PLANETILER_JAVA_OPTS` if the default heap hits runner limits. Germany may need a larger runner. Netlify: host outputs only.
- **Lacking (declared):** geoparquet, play_equipment_enrichment

## B1 vs B2 (prefilter vs direct osm2pgsql)

- **End-to-end (build + container wall):** B2 is 1012.38s faster than B1.
- **B2 osmium prefilter:** 34.59s
- **osm2pgsql import (B2 − B1):** -1045.03s
- **In-container script total (B2 − B1):** -1009.22s (from each pipeline’s `step_timings.json`, excludes image build)

## Failures

None.

## Installation cost notes

Image build time dominates the first run; for recurring benchmarks, compare **In-container (script)** and **Container** after images are built. Setup/install cost is documented in `results/notes/installation-costs.md` (not part of processing totals).

## Raw artifacts

- Per-pipeline: `data/output/<pipeline-id>/<dataset>/validation.json` and `step_timings.json`
- Full run: `results/runs/*.json`
