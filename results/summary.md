# Benchmark Summary

Generated from run artifact: `/Users/tordans/Development/OSM/osm-processing-pipeline-comparison/results/runs/run-2026-04-10T11-21-49-121Z-berlin.json`

- **Run ID:** `2026-04-10T11-21-49-121Z`
- **Dataset:** `berlin`
- **Input:** `/Users/tordans/Development/OSM/osm-processing-pipeline-comparison/data/raw/berlin-latest.osm.pbf`
- **Window:** `2026-04-10T11:21:49.121Z` → `2026-04-10T11:22:28.417Z`
- **Pipelines OK:** 4 / 4

## How to read this table

- **Build** is `docker build` time on the host (one-time per image change).
- **Container** is wall time for `docker run` (includes download/cache effects on first use).
- **In-container (script)** comes from each pipeline’s `step_timings.json` and reflects work inside the container only.
- **Val OK** reflects `validation.json` → `ok` from each pipeline run.

## Latest run — timings and outputs

| Pipeline | Status | Val OK | Build | Container | Total (build+run) | In-container (script) | Features | Parquet | PMTiles | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| osm2pgsql-postgis-direct | ok | yes | 0.52s | 18.69s | 19.20s | 15.92s | 5288 | 343.0 KiB | 426.3 KiB | — |
| osm2pgsql-postgis-prefilter | ok | yes | 0.88s | 4.83s | 5.70s | 4.52s | 5288 | 343.0 KiB | 426.3 KiB | — |
| osmium-gdal-tippecanoe | ok | yes | 5.75s | 2.63s | 8.38s | 2.37s | 5433 | 398.0 KiB | 776.0 KiB | — |
| planetiler-playgrounds | ok | yes | 1.15s | 4.84s | 5.99s | 4.65s | — | — | 636.0 KiB | — |

## Cross-pipeline sanity (feature counts)

- **osmium-gdal-tippecanoe:** 5433 features
- **osm2pgsql (B1, representative):** 5288 features
- **Delta:** 145 (2.7% vs B1). Different OSM-to-geometry assembly (GDAL OSM driver vs osm2pgsql flex) commonly yields small count differences; B1 and B2 should match when the extract is equivalent.

## Validation warnings

- **osm2pgsql-postgis-direct:** No exported features include play_equipment_count; dataset may lack amenity=playground polygons.
- **osm2pgsql-postgis-prefilter:** No exported features include play_equipment_count; dataset may lack amenity=playground polygons.

## Per-pipeline outputs and operations

Single-file **tile delivery** means `playgrounds.pmtiles` (HTTP-range-friendly archive). **Analysis format** means `playgrounds.parquet` (GeoParquet). Times come from each run’s `step_timings.json` where a matching step key exists.

### osm2pgsql-postgis-direct

- **PMTiles:** Yes — osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 0.24s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 0.62s (export_geoparquet)
- **Server / ops:** PostgreSQL + PostGIS + osm2pgsql + SQL post-process. Higher ops surface (extensions, tuning, disk for DB).
- **CI / static hosting:** Docker on GHA: Berlin is typical; Germany stresses RAM/disk and runtime. Same Netlify note: artifact hosting only.
- **Lacking (declared):** —

### osm2pgsql-postgis-prefilter

- **PMTiles:** Yes — Osmium `tags-filter` → osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 0.28s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 0.54s (export_geoparquet)
- **Server / ops:** Same as direct variant plus Osmium prefilter step; smaller import, still full Postgres lifecycle in the container.
- **CI / static hosting:** Same runner considerations as B1; prefilter reduces import time but still needs Postgres in Docker.
- **Lacking (declared):** —

### osmium-gdal-tippecanoe

- **PMTiles:** Yes — Osmium `tags-filter` → GDAL GeoJSONSeq (WGS84, 7 dp) → tippecanoe → `playgrounds.pmtiles`. — *step time:* 0.28s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 0.62s (export_geoparquet)
- **Server / ops:** No database. Stack: Osmium, GDAL, tippecanoe, Python/GeoPandas. Lowest moving parts for a one-off server job.
- **CI / static hosting:** Docker on GitHub Actions: usually fine for Berlin; Germany needs enough disk/RAM on the runner. Netlify/Vercel: use only to **host** static `.pmtiles`/`.parquet` after CI builds them — not to run this extract.
- **Lacking (declared):** —

### planetiler-playgrounds

- **PMTiles:** Yes — Planetiler custommap YAML (single JVM pass) → native PMTiles writer → `playgrounds.pmtiles`. — *step time:* 4.61s (planetiler_pmtiles)
- **GeoParquet:** No — Not supported — Planetiler does not emit Parquet; this benchmark does not add a second OSM pass to synthesize it. — *step time:* — (—)
- **Server / ops:** Single JVM + `planetiler.jar`; heap scales with extract size (~0.5× PBF recommended, 1 GiB floor in script). No DB.
- **CI / static hosting:** Docker on GHA: set `PLANETILER_JAVA_OPTS` if the default heap hits runner limits. Germany may need a larger runner. Netlify: host outputs only.
- **Lacking (declared):** geoparquet, play_equipment_enrichment

## B1 vs B2 (prefilter vs direct osm2pgsql)

- **End-to-end (build + container wall):** B2 is 13.50s faster than B1.
- **B2 osmium prefilter:** 0.89s
- **osm2pgsql import (B2 − B1):** -14.34s
- **In-container script total (B2 − B1):** -11.40s (from each pipeline’s `step_timings.json`, excludes image build)

## Failures

None.

## Installation cost notes

Image build time dominates the first run; for recurring benchmarks, compare **In-container (script)** and **Container** after images are built. Setup/install cost is documented in `results/notes/installation-costs.md` (not part of processing totals).

## Raw artifacts

- Per-pipeline: `data/output/<pipeline-id>/<dataset>/validation.json` and `step_timings.json`
- Full run: `results/runs/*.json`
