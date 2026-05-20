# Pipeline: cosmo (playgrounds)

Two benchmark variants sharing one Docker image and filter config ([`filters/playgrounds.yaml`](filters/playgrounds.yaml)).

| Variant | Script | OSM reads | Parquet | PMTiles |
| --- | --- | --- | --- | --- |
| `cosmo-playgrounds-dual-pass` | `scripts/run-dual-pass.sh` | 2× `cosmo convert` | Native cosmo | cosmo GeoJSONL → tippecanoe |
| `cosmo-playgrounds-single-pass` | `scripts/run-single-pass.sh` | 1× `cosmo convert` | GeoPandas from GDAL GeoJSONSeq | tippecanoe on same GeoJSONSeq |

Filter: `amenity=playground | playground` (see [cosmo](https://codeberg.org/mvexel/cosmo)). Relations are excluded (`relation: false`) because cosmo relation support is limited.

## Entry points

- `/workspace/pipelines/cosmo-playgrounds/scripts/run-dual-pass.sh`
- `/workspace/pipelines/cosmo-playgrounds/scripts/run-single-pass.sh`
