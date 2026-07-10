/** Markdown anchor + link helpers and per-pipeline Mermaid flow diagrams. */

export function pipelineAnchor(pipelineId: string): string {
  return pipelineId;
}

export function pipelineLink(pipelineId: string, label?: string): string {
  const text = label ?? pipelineId;
  return `[${text}](#${pipelineAnchor(pipelineId)})`;
}

interface PipelineFlowDoc {
  summary: string;
  mermaid: string;
}

const PIPELINE_FLOWS: Record<string, PipelineFlowDoc> = {
  "osmium-gdal-tippecanoe": {
    summary:
      "Osmium prefilter on PBF, GDAL to GeoJSONSeq, then GeoParquet (GeoPandas) and PMTiles (tippecanoe). No database.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  osmiumFilter["Osmium tags-filter"]
  filteredPbf["Filtered PBF"]
  gdalConvert["GDAL ogr2ogr GeoJSONSeq"]
  ndjson["NDJSON"]
  geoParquet["GeoParquet"]
  pmtiles["PMTiles"]
  validate["Validate"]

  inputPbf --> osmiumFilter --> filteredPbf --> gdalConvert --> ndjson
  ndjson --> geoParquet
  ndjson --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
  "osm2pgsql-postgis-direct": {
    summary:
      "Full PBF import via osm2pgsql flex into PostGIS, SQL enrichment, then shared NDJSON exports. No upstream prefilter.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  osm2pgsql["osm2pgsql flex import"]
  postgis["PostGIS"]
  sqlPost["SQL postprocess"]
  ogrNdjson["ogr2ogr GeoJSONSeq"]
  ndjson["NDJSON"]
  geoParquet["GeoParquet"]
  pmtiles["PMTiles"]
  validate["Validate"]

  inputPbf --> osm2pgsql --> postgis --> sqlPost --> ogrNdjson --> ndjson
  ndjson --> geoParquet
  ndjson --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
  "osm2pgsql-postgis-prefilter": {
    summary:
      "Osmium prefilter before osm2pgsql; same PostGIS SQL and export path as B1 (B2 reference pipeline).",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  osmiumFilter["Osmium tags-filter"]
  filteredPbf["Filtered PBF"]
  osm2pgsql["osm2pgsql flex import"]
  postgis["PostGIS"]
  sqlPost["SQL postprocess"]
  ogrNdjson["ogr2ogr GeoJSONSeq"]
  ndjson["NDJSON"]
  geoParquet["GeoParquet"]
  pmtiles["PMTiles"]
  validate["Validate"]

  inputPbf --> osmiumFilter --> filteredPbf --> osm2pgsql --> postgis
  postgis --> sqlPost --> ogrNdjson --> ndjson
  ndjson --> geoParquet
  ndjson --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
  "osm2pgsql-postgis-prefilter-osmfilter": {
    summary:
      "Prefilter via osmconvert + osmfilter (o5m), then same osm2pgsql → PostGIS → exports stack as B2.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  osmconvert["osmconvert to o5m"]
  osmfilter["osmfilter"]
  filteredData["Filtered OSM"]
  osm2pgsql["osm2pgsql flex import"]
  postgis["PostGIS"]
  sqlPost["SQL postprocess"]
  ogrNdjson["ogr2ogr GeoJSONSeq"]
  ndjson["NDJSON"]
  geoParquet["GeoParquet"]
  pmtiles["PMTiles"]
  validate["Validate"]

  inputPbf --> osmconvert --> osmfilter --> filteredData --> osm2pgsql --> postgis
  postgis --> sqlPost --> ogrNdjson --> ndjson
  ndjson --> geoParquet
  ndjson --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
  "planetiler-playgrounds": {
    summary:
      "Single Planetiler JVM pass from PBF to PMTiles via YAML rules. No GeoParquet or SQL stage.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  planetiler["Planetiler custommap"]
  pmtiles["PMTiles"]
  validate["Validate"]

  inputPbf --> planetiler --> pmtiles --> validate`,
  },
  "cosmo-playgrounds-dual-pass": {
    summary:
      "Two cosmo convert passes on the PBF: native GeoParquet, then GeoJSONL for tippecanoe PMTiles.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  cosmoParquet["cosmo convert Parquet"]
  geoParquet["GeoParquet"]
  cosmoGeojsonl["cosmo convert GeoJSONL"]
  geojsonl["GeoJSONL"]
  tippecanoe["tippecanoe"]
  pmtiles["PMTiles"]
  validate["Validate"]

  inputPbf --> cosmoParquet --> geoParquet
  inputPbf --> cosmoGeojsonl --> geojsonl --> tippecanoe --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
  "cosmo-playgrounds-single-pass": {
    summary:
      "One cosmo convert to GeoJSONL, GDAL normalization, then GeoPandas Parquet and tippecanoe PMTiles.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  cosmoExtract["cosmo convert GeoJSONL"]
  geojsonl["GeoJSONL"]
  gdalNorm["ogr2ogr GeoJSONSeq"]
  ndjson["NDJSON"]
  geoParquet["GeoParquet"]
  tippecanoe["tippecanoe"]
  pmtiles["PMTiles"]
  validate["Validate"]

  inputPbf --> cosmoExtract --> geojsonl --> gdalNorm --> ndjson
  ndjson --> geoParquet
  ndjson --> tippecanoe --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
  "osmnexus-postgis": {
    summary:
      "Osmium prefilter before OSMnexus Postgres import; same PostGIS SQL and export path as B2.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  osmiumFilter["Osmium tags-filter"]
  filteredPbf["Filtered PBF"]
  osmnexusPg["OSMnexus pg import"]
  postgis["PostGIS"]
  sqlPost["SQL postprocess"]
  ogrNdjson["ogr2ogr GeoJSONSeq"]
  ndjson["NDJSON"]
  geoParquet["GeoParquet"]
  pmtiles["PMTiles"]
  validate["Validate"]

  inputPbf --> osmiumFilter --> filteredPbf --> osmnexusPg --> postgis
  postgis --> sqlPost --> ogrNdjson --> ndjson
  ndjson --> geoParquet
  ndjson --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
  "osmnexus-geojson-direct": {
    summary:
      "Osmium prefilter, OSMnexus GeoJSON output, Python segment merge and polygonize, then shared exports. No database.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  osmiumFilter["Osmium tags-filter"]
  filteredPbf["Filtered PBF"]
  osmnexusGeojson["OSMnexus geojson"]
  geojson["GeoJSON"]
  pyTransform["Python transform"]
  ndjson["NDJSON"]
  geoParquet["GeoParquet"]
  pmtiles["PMTiles"]
  validate["Validate"]

  inputPbf --> osmiumFilter --> filteredPbf --> osmnexusGeojson --> geojson --> pyTransform --> ndjson
  ndjson --> geoParquet
  ndjson --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
};

export function buildPipelineFlowsChapter(pipelineIds: string[]): string[] {
  const sorted = [...pipelineIds].sort((a, b) => a.localeCompare(b));
  const lines: string[] = [
    "## Pipeline flows",
    "",
    "How each pipeline processes the same input PBF. Pipeline names in the tables above link here.",
    "",
    "### Quick links",
    "",
    sorted.map((id) => pipelineLink(id)).join(" · "),
    "",
  ];

  for (const id of sorted) {
    const doc = PIPELINE_FLOWS[id];
    if (!doc) {
      lines.push(`### ${id}`, "", "_No flow diagram defined for this pipeline._", "");
      continue;
    }
    lines.push(`### ${id}`, "", doc.summary, "", "```mermaid", doc.mermaid, "```", "");
  }

  return lines;
}
