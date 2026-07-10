# roads-bikelanes-osmnexus

Benchmark pipeline running **[OSMnexus](https://github.com/rush42/OSMnexus)** with the vendored **tilda-geo** roads + bikelanes topic configs (AGPL).

- **OSMnexus revision:** `e716644571b85a114a5d62c57a52d8060f9dbcc5`
- **Config:** `configs-tilda/` (roads + bikelanes topics + `_shared`)
- **Patches (applied at image build):**
  - `standalone-nodes.patch` — emit standalone node geometries for node-classified rows
  - `geojsonseq-output.patch` — add `--output geojsonseq` (newline-delimited GeoJSON per topic)

## Variants

| Script | Pipeline ID | PostGIS | Geometry offset |
|--------|-------------|---------|-----------------|
| `scripts/run-postgis.sh` | `roads-bikelanes-osmnexus-postgis` | yes | yes (`sql/postprocess.sql`) |
| `scripts/run-geojsonseq.sh` | `roads-bikelanes-osmnexus-geojsonseq` | no | no (center-line geometries) |

Both variants: OSMnexus classifies the full PBF (no Osmium prefilter) → `bikelanes.ndjson` → GeoParquet + PMTiles.

**Image stack:** Ubuntu 24.04, OSMnexus (Rust, pinned rev + patches), PostgreSQL 16 + PostGIS, GDAL, tippecanoe, geopandas/pyarrow.

## Benchmark adaptation

tilda-geo applies bikelane side offsets in Lua during import (`2_move_bikelanes.sql` semantics). OSMnexus configs cannot do width arithmetic, so the **postgis** variant materializes `bikelanes_export` / `roads_export` and applies the offset in `sql/postprocess.sql` (requires `--emit-way-geometries` at import). Parent road width tags are not available in OSMnexus rows; SQL uses per-highway defaults more often than production tilda. See the header comment in `sql/postprocess.sql` for details.

The **geojsonseq** variant streams WGS84 NDJSON directly from OSMnexus with no SQL stage — faster, but geometries stay on the road center line.
