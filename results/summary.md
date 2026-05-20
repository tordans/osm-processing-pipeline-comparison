# Benchmark Summary

Generated from run artifact: `/Users/tordans/Development/OSM/osm-processing-pipeline-comparison/results/runs/run-2026-05-20T12-39-18-714Z-berlin.json`

- **Run ID:** `2026-05-20T12-39-18-714Z`
- **Dataset:** `berlin`
- **Input:** `/Users/tordans/Development/OSM/osm-processing-pipeline-comparison/data/raw/berlin-latest.osm.pbf`
- **Window:** `2026-05-20T12:39:18.714Z` → `2026-05-20T13:26:59.790Z`
- **Pipelines OK:** 6 / 7

## How to read this table

- **Build** is `docker build` time on the host (one-time per image change).
- **Container** is wall time for `docker run` (includes download/cache effects on first use).
- **In-container (script)** comes from each pipeline’s `step_timings.json` and reflects work inside the container only.
- **Val OK** reflects `validation.json` → `ok` from each pipeline run.

## Latest run — timings and outputs

| Pipeline | Status | Val OK | Build | Container | Total (build+run) | In-container (script) | Features | Parquet | PMTiles | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cosmo-playgrounds-dual-pass | ok | yes | 1.74s | 7.12s | 8.86s | 6.66s | 5288 | 396.7 KiB | 183.7 KiB | — |
| cosmo-playgrounds-single-pass | ok | yes | 1.29s | 6.10s | 7.39s | 5.53s | 5288 | 303.2 KiB | 183.7 KiB | — |
| osm2pgsql-postgis-direct | failed | yes | 356.22s | 400.52s | 756.73s | 15.92s | 5288 | 343.0 KiB | 426.3 KiB | docker run failed |
| osm2pgsql-postgis-prefilter | ok | yes | 940.22s | 304.14s | 1244.35s | 279.00s | 5288 | 343.0 KiB | 426.3 KiB | — |
| osm2pgsql-postgis-prefilter-osmfilter | ok | yes | 475.94s | 14.58s | 490.52s | 12.57s | 5288 | 343.0 KiB | 426.3 KiB | — |
| osmium-gdal-tippecanoe | ok | yes | 207.42s | 97.38s | 304.79s | 86.86s | 5433 | 398.0 KiB | 776.0 KiB | — |
| planetiler-playgrounds | ok | yes | 28.82s | 19.21s | 48.03s | 18.56s | — | — | 636.0 KiB | — |

## vs osm2pgsql + Osmium prefilter (B2 reference)

Baseline: **osm2pgsql-postgis-prefilter** (Osmium `tags-filter` + osm2pgsql → PostGIS → exports). Other pipelines show wall-time deltas and relative duration vs that baseline.

| Pipeline | Total (build+run) vs B2 | Container vs B2 | In-container (script) vs B2 |
| --- | --- | --- | --- |
| osm2pgsql-postgis-prefilter | baseline | baseline | baseline |
| cosmo-playgrounds-dual-pass | 1235.49s faster; 99.3% less time than reference | 297.02s faster; 97.7% less time than reference | 272.33s faster; 97.6% less time than reference |
| cosmo-playgrounds-single-pass | 1236.96s faster; 99.4% less time than reference | 298.04s faster; 98.0% less time than reference | 273.47s faster; 98.0% less time than reference |
| osm2pgsql-postgis-direct | — (pipeline failed) | — | — |
| osm2pgsql-postgis-prefilter-osmfilter | 753.83s faster; 60.6% less time than reference | 289.56s faster; 95.2% less time than reference | 266.42s faster; 95.5% less time than reference |
| osmium-gdal-tippecanoe | 939.56s faster; 75.5% less time than reference | 206.76s faster; 68.0% less time than reference | 192.13s faster; 68.9% less time than reference |
| planetiler-playgrounds | 1196.33s faster; 96.1% less time than reference | 284.93s faster; 93.7% less time than reference | 260.44s faster; 93.3% less time than reference |

### Comparable in-container steps (same `step_timings.json` keys as B2)

Only steps emitted under the same name in B2 and another pipeline; empty cells mean that pipeline has no matching step.

| Step | cosmo-playgrounds-dual-pass | cosmo-playgrounds-single-pass | osm2pgsql-postgis-direct | osm2pgsql-postgis-prefilter-osmfilter | osmium-gdal-tippecanoe | planetiler-playgrounds |
| --- | --- | --- | --- | --- | --- | --- |
| export_geoparquet | 28.30s faster; 90.9% less time than reference | 29.69s faster; 95.3% less time than reference | — | 30.33s faster; 97.4% less time than reference | 26.60s faster; 85.4% less time than reference | — |
| export_pmtiles | 18.02s faster; 96.0% less time than reference | 18.32s faster; 97.6% less time than reference | — | 18.21s faster; 97.0% less time than reference | 9.19s faster; 49.0% less time than reference | — |
| validate | 0.03s slower; 16.3% more time than reference | 0.12s faster; 81.0% less time than reference | — | 0.10s faster; 66.7% less time than reference | 0.09s faster; 57.5% less time than reference | 0.09s faster; 55.6% less time than reference |

## B2 vs osmfilter prefilter (Osmium vs osmctools)

Same downstream steps as B2; only the prefilter differs: **B2** uses Osmium `tags-filter` on PBF; **osmfilter pipeline** uses `osmconvert` (full PBF→`.o5m`) then `osmfilter` (see [osmium-tool#253](https://github.com/osmcode/osmium-tool/issues/253)).

- **B2 prefilter (Osmium):** 200.34s
- **osmfilter pipeline prefilter (total):** 7.94s
  - *split:* `osmconvert` 5.29s + `osmfilter` 2.64s
- **Prefilter ratio (osmfilter total ÷ B2 Osmium):** 0.04×

## Cosmo dual-pass vs single-pass + GDAL

**Dual-pass:** two `cosmo convert` runs (native GeoParquet + GeoJSONL) then tippecanoe. **Single-pass:** one `cosmo convert` → `ogr2ogr` GeoJSONSeq → GeoPandas Parquet + tippecanoe.

| Metric | dual-pass | single-pass | dual vs single |
| --- | --- | --- | --- |
| Total (build+run) | 8.86s | 7.39s | 1.47s faster; 16.6% less time than reference |
| Container wall | 7.12s | 6.10s | 1.02s faster; 14.3% less time than reference |
| In-container (script) | 6.66s | 5.53s | 1.13s faster; 17.0% less time than reference |

- **Cosmo OSM read time (dual):** 5.72s (`export_geoparquet` + `cosmo_export_geojsonl`)
- **Cosmo OSM read time (single):** 3.18s (`cosmo_extract`)
- **Cosmo read ratio (dual total ÷ single):** 1.80×

### Step breakdown (in-container)

| Step | dual-pass | single-pass | dual vs single |
| --- | --- | --- | --- |
| `export_geoparquet` | 2.84s | 1.45s | 1.39s faster; 48.9% less time than reference |
| `cosmo_export_geojsonl` | 2.88s | — | — |
| `cosmo_extract` | — | 3.18s | — |
| `transform_convert` | — | 0.41s | — |
| `export_pmtiles` | 0.76s | 0.45s | 0.31s faster; 40.8% less time than reference |
| `validate` | 0.18s | 0.03s | 0.15s faster; 83.7% less time than reference |

## Cross-pipeline sanity (feature counts)

- **osmium-gdal-tippecanoe:** 5433 features
- **osm2pgsql (B1, representative):** 5288 features
- **Delta:** 145 (2.7% vs B1). Different OSM-to-geometry assembly (GDAL OSM driver vs osm2pgsql flex) commonly yields small count differences; B1 and B2 should match when the extract is equivalent.

## Validation warnings

- **cosmo-playgrounds-dual-pass:** Cosmo relation geometry omitted (relation: false); counts may be lower than nwr/osmium pipelines.
- **cosmo-playgrounds-dual-pass:** GeoParquet from native cosmo; PMTiles from a second full OSM read via cosmo GeoJSONL.
- **cosmo-playgrounds-single-pass:** Cosmo relation geometry omitted (relation: false); counts may be lower than nwr/osmium pipelines.
- **cosmo-playgrounds-single-pass:** GeoParquet via GeoPandas from GDAL-normalized GeoJSONSeq (not cosmo-native Parquet).
- **osm2pgsql-postgis-direct:** No exported features include play_equipment_count; dataset may lack amenity=playground polygons.
- **osm2pgsql-postgis-prefilter:** No exported features include play_equipment_count; dataset may lack amenity=playground polygons.
- **osm2pgsql-postgis-prefilter-osmfilter:** No exported features include play_equipment_count; dataset may lack amenity=playground polygons.

## Per-pipeline outputs and operations

Single-file **tile delivery** means `playgrounds.pmtiles` (HTTP-range-friendly archive). **Analysis format** means `playgrounds.parquet` (GeoParquet). Times come from each run’s `step_timings.json` where a matching step key exists.

### cosmo-playgrounds-dual-pass

- **PMTiles:** Yes — Two `cosmo convert` passes: native GeoParquet + GeoJSONL → tippecanoe → `playgrounds.pmtiles`. — *step time:* 0.76s (export_pmtiles)
- **GeoParquet:** Yes — Native cosmo GeoParquet (`export_geoparquet` step). — *step time:* 2.84s (export_geoparquet)
- **Server / ops:** Rust `cosmo` binary (compiled in image). No DB. Two full PBF scans for Parquet + tiles.
- **CI / static hosting:** First image build compiles cosmo from source. Berlin is fine on typical runners; Germany needs RAM/disk. Netlify: host outputs only.
- **Lacking (declared):** relation_multipolygons, play_equipment_enrichment

### cosmo-playgrounds-single-pass

- **PMTiles:** Yes — One `cosmo convert` → GeoJSONL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 0.45s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GDAL-normalized GeoJSONSeq, writes GeoParquet via PyArrow (single cosmo OSM read). — *step time:* 1.45s (export_geoparquet)
- **Server / ops:** Rust `cosmo` + GDAL + GeoPandas + tippecanoe. No DB. One PBF scan; GDAL/GeoPandas add moving parts vs dual-pass native Parquet.
- **CI / static hosting:** Same image as dual-pass. Compare in-container totals vs dual-pass to see one-read vs two-read tradeoff.
- **Lacking (declared):** relation_multipolygons, play_equipment_enrichment

### osm2pgsql-postgis-direct

- **PMTiles:** Yes — osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 0.24s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 0.62s (export_geoparquet)
- **Server / ops:** PostgreSQL + PostGIS + osm2pgsql + SQL post-process. Higher ops surface (extensions, tuning, disk for DB).
- **CI / static hosting:** Docker on GHA: Berlin is typical; Germany stresses RAM/disk and runtime. Same Netlify note: artifact hosting only.
- **Lacking (declared):** —

### osm2pgsql-postgis-prefilter

- **PMTiles:** Yes — Osmium `tags-filter` → osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 18.77s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 31.14s (export_geoparquet)
- **Server / ops:** Same as direct variant plus Osmium prefilter step; smaller import, still full Postgres lifecycle in the container.
- **CI / static hosting:** Same runner considerations as B1; prefilter reduces import time but still needs Postgres in Docker.
- **Lacking (declared):** —

### osm2pgsql-postgis-prefilter-osmfilter

- **PMTiles:** Yes — `osmconvert` (PBF→o5m) → osmfilter → osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`. — *step time:* 0.56s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 0.81s (export_geoparquet)
- **Server / ops:** Same as B2 but prefilter is osmconvert + osmfilter (no Osmium); needs extra disk for full `.o5m` before filtering.
- **CI / static hosting:** Same as B2; Germany needs enough disk for a full `.o5m` copy during `osmconvert` (osmfilter requires a seekable file).
- **Lacking (declared):** —

### osmium-gdal-tippecanoe

- **PMTiles:** Yes — Osmium `tags-filter` → GDAL GeoJSONSeq (WGS84, 7 dp) → tippecanoe → `playgrounds.pmtiles`. — *step time:* 9.58s (export_pmtiles)
- **GeoParquet:** Yes — GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed). — *step time:* 4.54s (export_geoparquet)
- **Server / ops:** No database. Stack: Osmium, GDAL, tippecanoe, Python/GeoPandas. Lowest moving parts for a one-off server job.
- **CI / static hosting:** Docker on GitHub Actions: usually fine for Berlin; Germany needs enough disk/RAM on the runner. Netlify/Vercel: use only to **host** static `.pmtiles`/`.parquet` after CI builds them — not to run this extract.
- **Lacking (declared):** —

### planetiler-playgrounds

- **PMTiles:** Yes — Planetiler custommap YAML (single JVM pass) → native PMTiles writer → `playgrounds.pmtiles`. — *step time:* 18.49s (planetiler_pmtiles)
- **GeoParquet:** No — Not supported — Planetiler does not emit Parquet; this benchmark does not add a second OSM pass to synthesize it. — *step time:* — (—)
- **Server / ops:** Single JVM + `planetiler.jar`; heap scales with extract size (~0.5× PBF recommended, 1 GiB floor in script). No DB.
- **CI / static hosting:** Docker on GHA: set `PLANETILER_JAVA_OPTS` if the default heap hits runner limits. Germany may need a larger runner. Netlify: host outputs only.
- **Lacking (declared):** geoparquet, play_equipment_enrichment

## B1 vs B2 (prefilter vs direct osm2pgsql)

B1 and B2 must both succeed to compare prefilter impact; see errors above.

## Failures

### osm2pgsql-postgis-direct

- **Orchestrator error:** docker run failed

```
…(truncated, showing last 6000 chars)
275/168    62.9%  9/275/168    63.0%  9/275/168    63.4%  9/275/168    63.5%  9/275/168    63.6%  9/275/168    63.7%  9/275/168    63.9%  9/275/167    64.0%  9/275/167    66.6%  9/275/167    66.7%  10/550/335    66.8%  10/550/335    66.9%  10/550/336    67.0%  10/550/336    67.1%  10/550/336    67.2%  10/550/336    67.3%  10/550/336    67.4%  10/550/336    67.5%  10/550/336    67.6%  10/550/336    67.7%  10/550/336    67.8%  10/550/336    67.9%  10/550/336    68.0%  10/550/336    68.1%  10/550/336    68.8%  10/550/336    68.6%  10/550/335    68.7%  10/550/335    68.8%  10/550/335    68.9%  10/550/336    69.0%  10/550/336    69.1%  10/550/336    69.2%  10/550/336    69.3%  10/550/336    69.4%  10/550/336    69.5%  10/550/336    69.6%  10/550/336    70.0%  10/550/335    70.1%  10/550/336    70.2%  10/550/336    70.3%  10/550/336    70.4%  10/550/336    70.5%  10/550/335    70.6%  10/550/335    70.7%  10/550/335    73.3%  10/550/335    73.4%  11/1100/671    73.5%  11/1100/672    73.6%  11/1100/672    73.8%  11/1100/672    73.9%  11/1100/672    74.0%  11/1100/672    74.1%  11/1100/672    73.6%  11/1100/671    74.1%  11/1100/672    74.2%  11/1100/672    74.3%  11/1100/672    74.4%  11/1100/672    74.5%  11/1100/672    74.6%  11/1100/672    74.7%  11/1100/672    74.8%  11/1100/672    74.9%  11/1100/672    75.0%  11/1100/672    75.1%  11/1100/672    75.2%  11/1100/672    75.3%  11/1100/672    75.4%  11/1100/672    75.5%  11/1100/672    75.7%  11/1100/672    75.8%  11/1100/672    75.9%  11/1100/671    76.0%  11/1100/671    76.1%  11/1100/671    76.0%  11/1100/672    76.3%  11/1100/672    76.5%  11/1100/671    76.6%  11/1100/671    76.7%  11/1100/671    76.8%  11/1100/672    76.9%  11/1100/672    77.5%  11/1100/672    79.9%  11/1100/672    80.0%  12/2200/1344    80.1%  12/2200/1343    80.2%  12/2200/1343    80.3%  12/2201/1343    80.4%  12/2201/1343    80.5%  12/2200/1343    80.7%  12/2201/1344    80.8%  12/2201/1344    80.9%  12/2201/1344    80.8%  12/2200/1343    80.9%  12/2201/1344    81.0%  12/2200/1343    81.1%  12/2200/1343    81.2%  12/2200/1343    81.3%  12/2200/1343    81.4%  12/2200/1343    81.5%  12/2200/1343    81.6%  12/2200/1343    81.7%  12/2200/1343    81.8%  12/2200/1343    81.9%  12/2200/1343    82.4%  12/2200/1343    82.5%  12/2200/1343    82.6%  12/2200/1343    82.7%  12/2200/1344    82.8%  12/2200/1344    82.9%  12/2200/1344    83.0%  12/2200/1344    83.1%  12/2200/1344    83.2%  12/2200/1344    83.3%  12/2200/1344    83.4%  12/2200/1344    83.5%  12/2200/1344    83.6%  12/2200/1344    83.7%  12/2200/1344    83.8%  12/2200/1344    83.9%  12/2200/1343    84.1%  12/2200/1345    84.2%  12/2200/1345    85.9%  12/2200/1344    86.6%  12/2201/1344    86.7%  13/4401/2688    86.8%  13/4401/2688    86.9%  13/4401/2688    87.0%  13/4401/2688    87.1%  13/4401/2688    87.2%  13/4401/2688    87.3%  13/4401/2688    87.6%  13/4401/2688    87.7%  13/4401/2688    87.9%  13/4401/2688    88.0%  13/4401/2688    88.1%  13/4401/2688    88.2%  13/4401/2688    88.3%  13/4401/2688    88.4%  13/4401/2688    88.5%  13/4401/2688    88.6%  13/4401/2688    88.7%  13/4401/2688    88.8%  13/4401/2688    88.9%  13/4401/2688    89.1%  13/4401/2688    89.2%  13/4401/2688    89.3%  13/4401/2691    89.3%  13/4398/2689    89.4%  13/4398/2689    89.5%  13/4402/2688    89.6%  13/4402/2688    89.7%  13/4402/2688    89.8%  13/4402/2688    89.9%  13/4402/2688    90.0%  13/4402/2688    90.1%  13/4402/2688    90.3%  13/4401/2686    90.3%  13/4400/2689    90.4%  13/4401/2686    90.5%  13/4401/2686    90.6%  13/4401/2686    90.4%  13/4401/2689    90.6%  13/4401/2686    90.7%  13/4401/2689    91.8%  13/4401/2688    92.9%  13/4402/2689    93.0%  13/4402/2689    93.1%  13/4402/2689    93.2%  13/4402/2689    93.3%  13/4400/2688    93.4%  14/8803/5374    93.5%  14/8802/5375    93.6%  14/8803/5375    93.7%  14/8795/5377    93.7%  14/8808/5382    93.9%  14/8802/5382    94.0%  14/8803/5376    94.1%  14/8803/5376    94.2%  14/8803/5375    94.3%  14/8803/5376    94.4%  14/8803/5376    94.5%  14/8803/5376    94.6%  14/8799/5379    95.1%  14/8803/5376    95.2%  14/8809/5370    95.3%  14/8810/5379    95.4%  14/8797/5375    95.5%  14/8815/5383    95.6%  14/8805/5379    95.7%  14/8798/5377    95.8%  14/8803/5372    95.8%  14/8800/5374    95.9%  14/8803/5372    95.9%  14/8803/5372    95.8%  14/8806/5370    95.8%  14/8795/5368    96.0%  14/8795/5368    96.1%  14/8805/5374    95.8%  14/8806/5379    96.1%  14/8806/5379    96.1%  14/8800/5369    96.2%  14/8804/5373    96.3%  14/8805/5380    96.4%  14/8802/5372    96.5%  14/8801/5369    96.6%  14/8803/5378    96.7%  14/8803/5378    96.8%  14/8803/5377    96.9%  14/8803/5377    97.0%  14/8795/5381    97.0%  14/8802/5376    97.0%  14/8792/5369    97.0%  14/8796/5372    97.1%  14/8799/5375    97.2%  14/8803/5377    97.3%  14/8803/5377    97.0%  14/8804/5375    97.1%  14/8796/5379    97.3%  14/8808/5375    97.4%  14/8808/5375    97.5%  14/8802/5376    97.1%  14/8804/5375    97.5%  14/8804/5375    97.5%  14/8809/5373    97.6%  14/8804/5375    97.6%  14/8802/5376    97.7%  14/8802/5376    97.8%  14/8806/5374    97.9%  14/8797/5379    98.1%  14/8793/5379    98.1%  14/8795/5382    98.1%  14/8806/5375    98.2%  14/8805/5376    98.3%  14/8800/5372    98.4%  14/8804/5377    98.5%  14/8800/5380    98.6%  14/8804/5378    98.7%  14/8804/5378    98.6%  14/8809/5379    98.8%  14/8804/5378    98.9%  14/8804/5378    99.0%  14/8804/5376    99.1%  14/8811/5371    99.2%  14/8799/5367    99.3%  14/8805/5377    99.4%  14/8804/5376    99.5%  14/8800/5378    99.6%  14/8805/5377    99.7%  14/8790/5378    99.8%  14/8802/5377    99.9%  14/8799/5370  
/workspace/data/output/osm2pgsql-postgis-direct/berlin/playgrounds.pmtiles: integrity_check: database disk image is malformed
```

## Installation cost notes

Image build time dominates the first run; for recurring benchmarks, compare **In-container (script)** and **Container** after images are built. Setup/install cost is documented in `results/notes/installation-costs.md` (not part of processing totals).

## Raw artifacts

- Per-pipeline: `data/output/<pipeline-id>/<dataset>/validation.json` and `step_timings.json`
- Full run: `results/runs/*.json`
