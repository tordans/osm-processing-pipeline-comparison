# Benchmark Methodology

## Goal

Compare pipeline variants on equal conditions for OSM playground extraction and output generation.

## Fairness rules

- Same input dataset per comparison run
- Same machine and Docker runtime
- Sequential execution (no overlapping pipeline runs)
- **OSM filter (opinionated dataset):** nodes, ways, and relations with `leisure=playground` or any `playground=*` tag (Osmium: `nwr/leisure=playground nwr/playground=*`)
- **Output contract:** the **target** for comparable pipelines is **PMTiles** (`playgrounds.pmtiles`) **and** **GeoParquet** (`playgrounds.parquet`). Pipelines that cannot produce an artifact **declare** the gap in `validation.json` (e.g. `lacking`) and remain valid if they meet their own checks (no second OSM pass added only to hide a gap).
- Validation rules are defined per pipeline where needed (e.g. Planetiler does not emit a per-OSM-element `feature_count` comparable to GeoJSONSeq line counts; it may use `null` plus a note).
- Capability flags for unsupported steps
- Shared geometric serialization policy for NDJSON fed to tippecanoe (pipelines that use tippecanoe):
  - `ogr2ogr` GeoJSONSeq with `COORDINATE_PRECISION=7` and `RFC7946=YES` (7 decimals ≈ OSM’s 1e-7° node resolution; PostGIS stores float8 but does not add meaningful digits beyond that)
  - explicit `-t_srs EPSG:4326` on conversion
  - identical tippecanoe tile resolution flags (`--full-detail`, `--low-detail`, `--minimum-detail` = 12) across those pipelines
- **Planetiler vs tippecanoe:** MVT bytes and vertex handling differ; PMTiles from Planetiler are not expected to match tippecanoe output bit-for-bit.
- **Cosmo variants (paired comparison):**
  - `cosmo-playgrounds-dual-pass`: two `cosmo convert` runs — native GeoParquet plus GeoJSONL for tippecanoe; relations omitted in filter (`relation: false`).
  - `cosmo-playgrounds-single-pass`: one `cosmo convert` to GeoJSONL, then the same GDAL GeoJSONSeq + GeoPandas Parquet + tippecanoe path as `osmium-gdal-tippecanoe` (Parquet is not cosmo-native in this variant).
  - Summary compares dual-pass vs single-pass wall times and cosmo OSM read totals (`export_geoparquet` + `cosmo_export_geojsonl` vs `cosmo_extract`).

## Export semantics (feature identity)

Comparable pipelines export **each OSM object once**, keyed by (`osm_type`, `osm_id`):

- nodes → Point
- open ways → LineString; closed target ways → Polygon
- relations → (Multi)Polygon assembled from member ways where possible
- attribute columns: `osm_id`, `osm_type`, `name`, `leisure`, `playground`, `play_equipment_count`
- **Enrichment:** `leisure=playground` polygons carry `play_equipment_count` (count of intersecting `playground=*` features); all other features carry `null`

History: until 2026-07 the filter used `amenity=playground` (a tag real playgrounds do not use — Berlin matched 18 objects), and the osm2pgsql pipelines exported closed playground ways twice (LineString + Polygon). Both were fixed; runs before that are not comparable to current runs.

### Known feature-count differences (Berlin reference: ~10 627)

| Pipeline | Features | Why it differs |
| --- | --- | --- |
| osm2pgsql family (B1/B2/B2-osmfilter) | 10 627 | Reference. Drops one relation whose multipolygon `osm2pgsql` cannot assemble. |
| osmnexus (both variants) | 10 628 | Recovers that broken multipolygon relation geometrically (`ST_BuildArea` over merged member lines). |
| cosmo (both variants) | 10 598 | Exports no relation features (`relation: false` in its filter). |
| osmium-gdal-tippecanoe | 11 789 | GDAL OSM-driver layer semantics emit some objects in more than one layer; not yet deduplicated (open task). |

### OSMnexus specifics

- Built from source at a pinned rev with a vendored patch that emits standalone classified nodes (upstream drops nodes not referenced by kept ways; see [rush42/OSMnexus#1](https://github.com/rush42/OSMnexus/issues/1)).
- Stores node coordinates as `f32`: point positions deviate up to ~0.21 m from the reference, so the 7-decimal serialization policy is not fully met for points.
- Relation inner/outer roles are not preserved; holes are inferred from ring nesting (verified equivalent on all Berlin playground relations).

## Measurements

For each pipeline run:

- step runtime (ms)
- total runtime (ms)
- command exit code
- output sizes (`pmtiles_bytes`, `parquet_bytes` where applicable)
- feature count checks where comparable
- validation pass/fail

For `osm2pgsql` variants comparison:

- Compare direct input vs prefilter:
  - end-to-end runtime
  - prefilter overhead
  - import and SQL runtime deltas

## Warmup policy

- Optional one warmup run per pipeline
- Measured run is recorded separately

## Non-goals for this phase

- Installation/setup timing is documented but not measured in benchmark totals.

## Failure criteria

- Missing **required** output files **for that pipeline’s declared contract** (e.g. PMTiles must exist for all pipelines in this benchmark)
- Zero extracted features when the pipeline claims support
- Missing required fields for that pipeline’s validation
- Failed validation commands

## Canonical run artifact (`comparison.json`)

Every pipeline writes the same schema to `data/output/<pipeline-id>/<dataset>/comparison.json`:

- `dataset`: `{ name, inputPath, sourceUrl }` — explicit dataset used for the run
- `timingsMs`: `filter`, `cleanTransform`, `exportGeoParquet`, `exportPmtiles`, `sqlPostprocess`, `validate`, `totalInContainer` (null when not applicable)
- `requirements`: four core checks with `matched` and `reasonIfNotMatched` when false
- `artifacts` and `quality` (validation result, feature count, notes)

`step_timings.json` mirrors the canonical step keys for backward compatibility.

## Summary generation

`results/summary.md` is generated by reading each pipeline’s `comparison.json` (timings and requirements) plus orchestrator wall-clock fields from `results/runs/*.json`. It includes:

- dataset used (name, path, source URL)
- comparable timings and core requirement table
- B2 reference deltas and paired comparisons (B1/B2, Osmium vs osmfilter, Cosmo variants)
