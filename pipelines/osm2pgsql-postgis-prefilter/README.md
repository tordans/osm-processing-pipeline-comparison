# Pipeline: osmium prefilter + osm2pgsql + PostGIS

## Purpose

Evaluate whether an extra osmium prefilter step improves total runtime for the osm2pgsql/PostGIS pipeline.

## Steps

1. Prefilter source PBF via `osmium tags-filter`
2. Import filtered data with `osm2pgsql --output=flex`
3. SQL normalization and enrichment (`play_equipment_count`)
4. Export NDJSON and Parquet (GeoJSONSeq with `COORDINATE_PRECISION=7`, same as the osmium-gdal pipeline)
5. Build PMTiles with `tippecanoe` (same detail flags as other pipelines)
6. Validate outputs

## Entry point

- `scripts/run.sh`
