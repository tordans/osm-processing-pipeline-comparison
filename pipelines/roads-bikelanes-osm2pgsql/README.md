# roads-bikelanes-osm2pgsql

Benchmark pipeline vendoring the **tilda-geo** `roads_bikelanes` osm2pgsql flex topic (AGPL).

- **Source:** [tilda-geo](https://github.com/fixmycity/tilda-geo) @ `315e7e452381c7b5c3aff5feb307fc4090b39cb7`
- **Entry:** `lua/topics/roads_bikelanes/roads_bikelanes.lua`
- **SQL:** `sql/roads_bikelanes.sql` (+ offset move + todos cleanup)

## Variants

| Script | Pipeline ID | Prefilter |
|--------|-------------|-----------|
| `scripts/run-prefilter-osmium.sh` | `roads-bikelanes-osm2pgsql-prefilter-osmium` | Osmium `tags-filter w/highway` |
| `scripts/run-direct.sh` | `roads-bikelanes-osm2pgsql-direct` | none (full PBF) |

Both variants: osm2pgsql flex import → PostGIS SQL → `bikelanes.ndjson` → GeoParquet + PMTiles.

**Image stack:** Debian trixie, osm2pgsql 2.3+ (backports), PostgreSQL 16 + PostGIS (PGDG). The benchmark DB enables `btree_gist` (required for tilda `(minzoom, geom)` GIST indexes, same as production `initialize.ts`).

## Benchmark adaptation

Pseudo-tag enrichment (`prepare_pseudo_tags_roads_bikelanes.lua` and the sidepath / settlement-area CSV loaders) is **stubbed to no-ops** so the pipeline runs without TS-generated `/data/pseudoTagsData/*.csv` files. All other Lua modules are byte-identical to tilda-geo at the source revision above.
