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
  "roads-bikelanes-osm2pgsql-prefilter-osmium": {
    summary:
      "Osmium prefilter (highway ways) before tilda-geo osm2pgsql flex import, PostGIS SQL offset/cleanup, then shared NDJSON exports.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  osmiumFilter["Osmium tags-filter w/highway"]
  filteredPbf["Filtered PBF"]
  osm2pgsql["osm2pgsql flex roads_bikelanes"]
  postgis["PostGIS"]
  sqlPost["SQL offset + todos cleanup"]
  ogrNdjson["ogr2ogr GeoJSONSeq"]
  ndjson["bikelanes.ndjson"]
  geoParquet["bikelanes.parquet"]
  pmtiles["bikelanes.pmtiles"]
  validate["Validate"]

  inputPbf --> osmiumFilter --> filteredPbf --> osm2pgsql --> postgis
  postgis --> sqlPost --> ogrNdjson --> ndjson
  ndjson --> geoParquet
  ndjson --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
  "roads-bikelanes-osm2pgsql-direct": {
    summary:
      "Full PBF import via tilda-geo osm2pgsql flex (no prefilter), PostGIS SQL, then NDJSON → GeoParquet + PMTiles.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  osm2pgsql["osm2pgsql flex roads_bikelanes"]
  postgis["PostGIS"]
  sqlPost["SQL offset + todos cleanup"]
  ogrNdjson["ogr2ogr GeoJSONSeq"]
  ndjson["bikelanes.ndjson"]
  geoParquet["bikelanes.parquet"]
  pmtiles["bikelanes.pmtiles"]
  validate["Validate"]

  inputPbf --> osm2pgsql --> postgis --> sqlPost --> ogrNdjson --> ndjson
  ndjson --> geoParquet
  ndjson --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
  "roads-bikelanes-osmnexus-postgis": {
    summary:
      "OSMnexus filters while importing into Postgres; SQL offset/cleanup; same export path as osm2pgsql variants.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  osmnexusPg["OSMnexus pg import"]
  postgis["PostGIS"]
  sqlPost["SQL offset + cleanup"]
  ogrNdjson["ogr2ogr GeoJSONSeq"]
  ndjson["bikelanes.ndjson"]
  geoParquet["bikelanes.parquet"]
  pmtiles["bikelanes.pmtiles"]
  validate["Validate"]

  inputPbf --> osmnexusPg --> postgis
  postgis --> sqlPost --> ogrNdjson --> ndjson
  ndjson --> geoParquet
  ndjson --> pmtiles
  geoParquet --> validate
  pmtiles --> validate`,
  },
  "roads-bikelanes-osmnexus-geojsonseq": {
    summary:
      "OSMnexus streams filtered bikelanes to NDJSON; GeoPandas Parquet and tippecanoe PMTiles. No database.",
    mermaid: `flowchart LR
  inputPbf["OSM PBF"]
  osmnexusStream["OSMnexus geojsonseq stream"]
  ndjson["bikelanes.ndjson"]
  geoParquet["bikelanes.parquet"]
  pmtiles["bikelanes.pmtiles"]
  validate["Validate"]

  inputPbf --> osmnexusStream --> ndjson
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
