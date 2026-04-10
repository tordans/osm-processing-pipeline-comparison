# Pipeline: planetiler-playgrounds

Planetiler **custommap** YAML → **`playgrounds.pmtiles`** in one pass (no Osmium prefilter, no tippecanoe, no PostGIS).

## Outputs

- `playgrounds.pmtiles` (layer `playgrounds`)
- `validation.json` (includes `lacking`: GeoParquet and play-equipment enrichment are **not** produced by this toolchain)
- `step_timings.json`

## Not produced

- `playgrounds.parquet` — Planetiler does not write Parquet.
- `play_equipment_count` — requires a spatial join; not expressed in YAML custommap here.

## Heap

Planetiler recommends roughly **0.5× the input `.osm.pbf` file size** for `-Xmx`. The script uses `max(0.5× file size, 1 GiB)` as a practical floor (Berlin failed below 1 GiB in Docker) and caps at 8 GiB. Override with `PLANETILER_JAVA_OPTS` if needed.

## Run (orchestrator)

Registered as `planetiler-playgrounds` in `orchestrator/src/config.ts`; use the repo orchestrator like other pipelines.
