# Pipeline: osmfilter prefilter + osm2pgsql + PostGIS

## Purpose

Same toolchain as `osm2pgsql-postgis-prefilter` (B2), but replaces **Osmium** `tags-filter` with **osmfilter** (from [osmctools](https://wiki.openstreetmap.org/wiki/Osmfilter)) plus `osmconvert` (PBF→`.o5m`), as discussed in [osmium-tool#253](https://github.com/osmcode/osmium-tool/issues/253).

Use this pipeline to compare prefilter CPU and wall time against B2 on identical downstream steps (osm2pgsql flex → PostGIS → GeoJSONSeq → Parquet → PMTiles).

## Steps

1. `osmconvert` full PBF → `.o5m` (osmfilter requires a seekable file; it does not read stdin)
2. `osmfilter` keep objects matching `amenity=playground` **or** `playground` (any value), matching B2’s Osmium `tags-filter` intent
3. Remove the full `.o5m` before import to free disk
4. Import filtered `.o5m` with osm2pgsql (same flex style and SQL as B2 — paths under `pipelines/osm2pgsql-postgis-prefilter/`)
5. Same exports and validation as B2

## Entry point

- `scripts/run.sh`

## Isolation

Tools are installed only inside this image via `apt-get`; the host is not modified. Runs use the same `docker run -v repo:/workspace` pattern as other pipelines.
