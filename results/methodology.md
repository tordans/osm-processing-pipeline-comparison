# Benchmark Methodology

## Goal

Compare pipeline variants on equal conditions for OSM playground extraction and output generation.

## Fairness rules

- Same input dataset per comparison run
- Same machine and Docker runtime
- Sequential execution (no overlapping pipeline runs)
- **Output contract:** the **target** for comparable pipelines is **PMTiles** (`playgrounds.pmtiles`) **and** **GeoParquet** (`playgrounds.parquet`). Pipelines that cannot produce an artifact **declare** the gap in `validation.json` (e.g. `lacking`) and remain valid if they meet their own checks (no second OSM pass added only to hide a gap).
- Validation rules are defined per pipeline where needed (e.g. Planetiler does not emit a per-OSM-element `feature_count` comparable to GeoJSONSeq line counts; it may use `null` plus a note).
- Capability flags for unsupported steps
- Shared geometric serialization policy for NDJSON fed to tippecanoe (pipelines that use tippecanoe):
  - `ogr2ogr` GeoJSONSeq with `COORDINATE_PRECISION=7` and `RFC7946=YES` (7 decimals ≈ OSM’s 1e-7° node resolution; PostGIS stores float8 but does not add meaningful digits beyond that)
  - explicit `-t_srs EPSG:4326` on conversion
  - identical tippecanoe tile resolution flags (`--full-detail`, `--low-detail`, `--minimum-detail` = 12) across those pipelines
- **Planetiler vs tippecanoe:** MVT bytes and vertex handling differ; PMTiles from Planetiler are not expected to match tippecanoe output bit-for-bit.

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

## Summary generation

`results/summary.md` is generated from `results/runs/*.json` and includes:

- latest run table
- **Per-pipeline profile:** PMTiles support (how, step time), GeoParquet support (how, step time), server/ops notes, CI/static-hosting notes, and declared `lacking` entries
- B1 vs B2 delta notes
- complexity notes (see per-pipeline section)
