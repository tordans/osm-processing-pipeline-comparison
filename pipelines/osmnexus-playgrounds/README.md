# Pipeline: OSMnexus (playgrounds)

[OSMnexus](https://github.com/rush42/OSMnexus) is a Rust streaming OSM classifier (pinned rev `1eae18d4b28c94c29e9575c38aeed2476a87ce03`, AGPL-3.0). Two benchmark variants share one Docker image and playground topic config under `configs/playgrounds/`.

| Variant | Script | PostGIS | Enrichment |
| --- | --- | --- | --- |
| `osmnexus-postgis` | `scripts/run-postgis.sh` | Yes (import + SQL) | `play_equipment_count` via SQL |
| `osmnexus-geojson-direct` | `scripts/run-geojson-direct.sh` | No | Not supported |

## standalone-nodes patch

Upstream OSMnexus only emits `nodes` rows referenced by kept ways. Playground benchmarks need free-standing tagged nodes (`amenity=playground` points, equipment nodes), so the image build applies `patches/standalone-nodes.patch` before `cargo build`.

## Step flows

**PostGIS (`osmnexus-postgis`):** Osmium `tags-filter` → embedded Postgres 16 + PostGIS → `osmnexus --output pg` (with way/relation geometry tables) → `sql/postprocess.sql` → `ogr2ogr` GeoJSONSeq → GeoPandas GeoParquet → tippecanoe PMTiles → validation.

**GeoJSON direct (`osmnexus-geojson-direct`):** Osmium `tags-filter` → `osmnexus --output geojson` → Python transform (segment merge, polygonize closed rings) → GeoJSONSeq → GeoPandas GeoParquet → tippecanoe PMTiles → validation.

## Known caveats

- OSMnexus stores closed ways as LineString rings, not polygons; polygonization happens in SQL (PostGIS) or the geojson-direct Python transform.
- Relation inner/outer roles are not preserved; holes are inferred from ring nesting (`ST_BuildArea` / Shapely `polygonize`).
- Node coordinates are stored as `f32` internally (~1 m precision), so the shared 7-decimal GeoJSON coordinate policy is not fully met for point features.

## Entry points

- `/workspace/pipelines/osmnexus-playgrounds/scripts/run-postgis.sh`
- `/workspace/pipelines/osmnexus-playgrounds/scripts/run-geojson-direct.sh`
