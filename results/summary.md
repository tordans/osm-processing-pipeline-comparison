# Benchmark Summary

Generated from run artifact: `/Users/tordans/Development/OSM/osm-processing-pipeline-comparison/results/runs/run-2026-05-20T18-10-55-079Z-germany.json`

- **Run ID:** `2026-05-20T18-10-55-079Z`
- **Dataset:** `germany`
- **Input:** `/Users/tordans/Development/OSM/osm-processing-pipeline-comparison/data/raw/germany-latest.osm.pbf`
- **Window:** `2026-05-20T18:10:55.079Z` → `2026-05-20T18:44:58.882Z`
- **Pipelines OK:** 7 / 7

## How to read this report

- Timings and requirement status are read from each pipeline’s `comparison.json` only.
- **Build** is `docker build` time on the host (one-time per image change).
- **Container** is wall time for `docker run`.
- **In-container total** is script wall time inside the container.

## Dataset used for this run

- **Name:** `germany`
- **Input path:** `/workspace/data/raw/germany-latest.osm.pbf`
- **Source URL:** https://download.geofabrik.de/europe/germany-latest.osm.pbf

## Comparable timings and requirements

All values come from each pipeline’s `comparison.json` (canonical schema). `—` means the step is not applicable for that pipeline.

| Pipeline | Dataset | Input PBF | Filter | Clean/transform | GeoParquet | PMTiles | SQL postprocess | Validate | In-container total | Build | Container | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cosmo-playgrounds-dual-pass | germany | /workspace/data/raw/germany-latest.osm.pbf | — | 100.33s | 86.68s | 6.85s | — | 0.21s | 194.08s | 1.73s | 194.90s | 196.63s |
| cosmo-playgrounds-single-pass | germany | /workspace/data/raw/germany-latest.osm.pbf | — | 110.65s | 2.44s | 4.88s | — | 0.12s | 118.10s | 2.85s | 118.61s | 121.46s |
| osm2pgsql-postgis-direct | germany | /workspace/data/raw/germany-latest.osm.pbf | — | 1363.57s | 1.60s | 5.14s | 0.54s | 0.17s | 1371.03s | 1.13s | 1376.11s | 1377.23s |
| osm2pgsql-postgis-prefilter | germany | /workspace/data/raw/germany-latest.osm.pbf | 33.70s | 2.05s | 1.41s | 3.89s | 0.40s | 0.16s | 43.87s | 4.89s | 46.82s | 51.71s |
| osm2pgsql-postgis-prefilter-osmfilter | germany | /workspace/data/raw/germany-latest.osm.pbf | 141.19s | 1.79s | 1.39s | 5.13s | 0.34s | 0.28s | 152.40s | 1.05s | 153.18s | 154.22s |
| osmium-gdal-tippecanoe | germany | /workspace/data/raw/germany-latest.osm.pbf | 32.68s | 0.89s | 1.72s | 4.37s | — | 0.16s | 39.82s | 3.03s | 40.30s | 43.33s |
| planetiler-playgrounds | germany | /workspace/data/raw/germany-latest.osm.pbf | — | — | — | 96.94s | — | 0.05s | 96.99s | 1.48s | 97.53s | 99.01s |

### Core requirements

| Pipeline | 1. GeoParquet | 2. PMTiles | 3. Filter/clean/confirmed | 4. SQL postprocess/confirmed | Val OK | Features | Parquet | PMTiles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cosmo-playgrounds-dual-pass | yes | yes | yes | no (Pipeline has no SQL/PostGIS stage) | yes | 86298 | 4.07 MiB | 3.27 MiB |
| cosmo-playgrounds-single-pass | yes | yes | yes | no (Pipeline has no SQL/PostGIS stage) | yes | 86298 | 3.01 MiB | 3.27 MiB |
| osm2pgsql-postgis-direct | yes | yes | yes | yes | yes | 86303 | 3.67 MiB | 7.98 MiB |
| osm2pgsql-postgis-prefilter | yes | yes | yes | yes | yes | 86303 | 3.67 MiB | 7.98 MiB |
| osm2pgsql-postgis-prefilter-osmfilter | yes | yes | yes | yes | yes | 86303 | 3.67 MiB | 7.98 MiB |
| osmium-gdal-tippecanoe | yes | yes | yes | no (Pipeline has no SQL/PostGIS stage) | yes | 86738 | 4.15 MiB | 10.21 MiB |
| planetiler-playgrounds | no (Planetiler does not emit GeoParquet) | yes | yes | no (Pipeline has no SQL/PostGIS stage) | yes | — | — | 12.98 MiB |


## vs osm2pgsql + Osmium prefilter (B2 reference)

Baseline: **osm2pgsql-postgis-prefilter** (Osmium `tags-filter` + osm2pgsql → PostGIS → exports). Other pipelines show wall-time deltas and relative duration vs that baseline.

| Pipeline | Total (build+run) vs B2 | Container vs B2 | In-container (script) vs B2 |
| --- | --- | --- | --- |
| osm2pgsql-postgis-prefilter | baseline | baseline | baseline |
| cosmo-playgrounds-dual-pass | 144.92s slower; 280.3% more time than reference | 148.08s slower; 316.3% more time than reference | 150.21s slower; 342.4% more time than reference |
| cosmo-playgrounds-single-pass | 69.76s slower; 134.9% more time than reference | 71.80s slower; 153.3% more time than reference | 74.23s slower; 169.2% more time than reference |
| osm2pgsql-postgis-direct | 1325.53s slower; 2563.6% more time than reference | 1329.29s slower; 2839.2% more time than reference | 1327.16s slower; 3025.3% more time than reference |
| osm2pgsql-postgis-prefilter-osmfilter | 102.52s slower; 198.3% more time than reference | 106.36s slower; 227.2% more time than reference | 108.53s slower; 247.4% more time than reference |
| osmium-gdal-tippecanoe | 8.38s faster; 16.2% less time than reference | 6.52s faster; 13.9% less time than reference | 4.05s faster; 9.2% less time than reference |
| planetiler-playgrounds | 47.30s slower; 91.5% more time than reference | 50.71s slower; 108.3% more time than reference | 53.12s slower; 121.1% more time than reference |

### Comparable in-container steps (canonical `comparison.json` keys)

Only canonical steps with numeric timings in B2 and another pipeline; empty cells mean that pipeline has no timing for that step.

| Step | cosmo-playgrounds-dual-pass | cosmo-playgrounds-single-pass | osm2pgsql-postgis-direct | osm2pgsql-postgis-prefilter-osmfilter | osmium-gdal-tippecanoe | planetiler-playgrounds |
| --- | --- | --- | --- | --- | --- | --- |
| filter | — | — | — | 107.50s slower; 319.0% more time than reference | 1.02s faster; 3.0% less time than reference | — |
| cleanTransform | 98.28s slower; 4791.7% more time than reference | 108.60s slower; 5294.9% more time than reference | 1361.52s slower; 66383.3% more time than reference | 0.26s faster; 12.7% less time than reference | 1.16s faster; 56.6% less time than reference | — |
| exportGeoParquet | 85.27s slower; 6056.1% more time than reference | 1.03s slower; 73.4% more time than reference | 0.19s slower; 13.6% more time than reference | 0.02s faster; 1.6% less time than reference | 0.31s slower; 22.3% more time than reference | — |
| exportPmtiles | 2.96s slower; 76.0% more time than reference | 0.99s slower; 25.4% more time than reference | 1.24s slower; 31.9% more time than reference | 1.24s slower; 31.9% more time than reference | 0.48s slower; 12.2% more time than reference | 93.05s slower; 2390.1% more time than reference |
| sqlPostprocess | — | — | 0.13s slower; 32.9% more time than reference | 0.07s faster; 16.1% less time than reference | — | — |
| validate | 0.06s slower; 35.9% more time than reference | 0.03s faster; 21.8% less time than reference | 0.02s slower; 12.2% more time than reference | 0.12s slower; 76.3% more time than reference | 0s (baseline) | 0.11s faster; 67.9% less time than reference |

## B2 vs osmfilter prefilter (Osmium vs osmctools)

Same downstream steps as B2; only the prefilter differs: **B2** uses Osmium `tags-filter` on PBF; **osmfilter pipeline** uses `osmconvert` (full PBF→`.o5m`) then `osmfilter` (see [osmium-tool#253](https://github.com/osmcode/osmium-tool/issues/253)).

- **B2 prefilter (Osmium):** 33.70s
- **osmfilter pipeline prefilter (total):** 141.19s
- **Prefilter ratio (osmfilter total ÷ B2 Osmium):** 4.19×

## Cosmo dual-pass vs single-pass + GDAL

**Dual-pass:** two `cosmo convert` runs (native GeoParquet + GeoJSONL) then tippecanoe. **Single-pass:** one `cosmo convert` → `ogr2ogr` GeoJSONSeq → GeoPandas Parquet + tippecanoe.

| Metric | dual-pass | single-pass | dual vs single |
| --- | --- | --- | --- |
| Total (build+run) | 196.63s | 121.46s | 75.16s faster; 38.2% less time than reference |
| Container wall | 194.90s | 118.61s | 76.29s faster; 39.1% less time than reference |
| In-container (script) | 194.08s | 118.10s | 75.98s faster; 39.1% less time than reference |

- **Cosmo OSM read time (dual):** 187.01s (`exportGeoParquet` + `cleanTransform`)
- **Cosmo OSM read time (single):** 110.65s (`cleanTransform`)
- **Cosmo read ratio (dual total ÷ single):** 1.69×

### Step breakdown (in-container)

| Step | dual-pass | single-pass | dual vs single |
| --- | --- | --- | --- |
| `cleanTransform` | 100.33s | 110.65s | 10.32s slower; 10.3% more time than reference |
| `exportGeoParquet` | 86.68s | 2.44s | 84.24s faster; 97.2% less time than reference |
| `exportPmtiles` | 6.85s | 4.88s | 1.97s faster; 28.8% less time than reference |
| `validate` | 0.21s | 0.12s | 0.09s faster; 42.5% less time than reference |

## Cross-pipeline sanity (feature counts)

- **osmium-gdal-tippecanoe:** 86738 features
- **osm2pgsql (B1, representative):** 86303 features
- **Delta:** 435 (0.5% vs B1). Different OSM-to-geometry assembly (GDAL OSM driver vs osm2pgsql flex) commonly yields small count differences; B1 and B2 should match when the extract is equivalent.

## Validation warnings

- **cosmo-playgrounds-dual-pass:** Cosmo relation geometry omitted (relation: false); counts may be lower than nwr/osmium pipelines.
- **cosmo-playgrounds-dual-pass:** GeoParquet from native cosmo; PMTiles from a second full OSM read via cosmo GeoJSONL.
- **cosmo-playgrounds-single-pass:** Cosmo relation geometry omitted (relation: false); counts may be lower than nwr/osmium pipelines.
- **cosmo-playgrounds-single-pass:** GeoParquet via GeoPandas from GDAL-normalized GeoJSONSeq (not cosmo-native Parquet).

## B1 vs B2 (prefilter vs direct osm2pgsql)

- **End-to-end (build + container wall):** B2 is 1325.53s faster than B1.
- **B2 osmium prefilter:** 33.70s
- **Clean/transform (B2 − B1):** -1361.52s
- **In-container total (B2 − B1):** -1327.16s (from each pipeline’s `comparison.json`, excludes image build)

## Failures

None.

## Installation cost notes

Image build time dominates the first run; for recurring benchmarks, compare **In-container (script)** and **Container** after images are built. Setup/install cost is documented in `results/notes/installation-costs.md` (not part of processing totals).

## Raw artifacts

- Per-pipeline: `data/output/<pipeline-id>/<dataset>/comparison.json`, `validation.json`, `step_timings.json`
- Full run: `results/runs/*.json`
