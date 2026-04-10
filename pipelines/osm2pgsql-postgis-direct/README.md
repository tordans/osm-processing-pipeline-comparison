# Pipeline: osm2pgsql + PostGIS (direct)

## Purpose

Import source PBF directly into PostGIS, enrich geometries, and export:

- `playgrounds.pmtiles`
- `playgrounds.parquet`

## Steps

1. Direct import via `osm2pgsql --output=flex`
2. SQL normalization and enrichment (`play_equipment_count`)
3. Export NDJSON and Parquet (GeoJSONSeq with `COORDINATE_PRECISION=7`, same as the osmium-gdal pipeline)
4. Build PMTiles with `tippecanoe` (same detail flags as other pipelines)
5. Validate outputs

## Entry point

- `scripts/run.sh`
