# Pipeline: osmium + GDAL + tippecanoe

## Purpose

Extract playground-related OSM objects from a source PBF and produce:

- `playgrounds.pmtiles`
- `playgrounds.parquet`

## Steps

1. Tag prefilter with `osmium tags-filter`
2. Convert with `ogr2ogr` to NDJSON and Parquet (WGS84, GeoJSON `COORDINATE_PRECISION=7` to match OSM 1e-7° resolution and the PostGIS exports)
3. Build PMTiles with `tippecanoe` (explicit detail levels aligned with the osm2pgsql pipelines)
4. Validate feature counts and required fields

## Entry point

- `scripts/run.sh`
