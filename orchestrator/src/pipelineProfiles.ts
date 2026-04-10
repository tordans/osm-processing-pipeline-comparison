import type { PipelineRunResult } from "./types";

/** Step keys in each pipeline’s `step_timings.json` → `steps_ms` (for summary timing columns). */
export const PMTILES_STEP_KEYS: Record<string, string> = {
  "osmium-gdal-tippecanoe": "export_pmtiles",
  "osm2pgsql-postgis-direct": "export_pmtiles",
  "osm2pgsql-postgis-prefilter": "export_pmtiles",
  "planetiler-playgrounds": "planetiler_pmtiles",
};

export const PARQUET_STEP_KEYS: Record<string, string | undefined> = {
  "osmium-gdal-tippecanoe": "export_geoparquet",
  "osm2pgsql-postgis-direct": "export_geoparquet",
  "osm2pgsql-postgis-prefilter": "export_geoparquet",
  "planetiler-playgrounds": undefined,
};

const DELIVERY_HOW: Record<string, string> = {
  "osmium-gdal-tippecanoe":
    "Osmium `tags-filter` → GDAL GeoJSONSeq (WGS84, 7 dp) → tippecanoe → `playgrounds.pmtiles`.",
  "osm2pgsql-postgis-direct":
    "osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`.",
  "osm2pgsql-postgis-prefilter":
    "Osmium `tags-filter` → osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`.",
  "planetiler-playgrounds":
    "Planetiler custommap YAML (single JVM pass) → native PMTiles writer → `playgrounds.pmtiles`.",
};

const PARQUET_HOW: Record<string, string> = {
  "osmium-gdal-tippecanoe":
    "GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed).",
  "osm2pgsql-postgis-direct":
    "GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed).",
  "osm2pgsql-postgis-prefilter":
    "GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed).",
  "planetiler-playgrounds":
    "Not supported — Planetiler does not emit Parquet; this benchmark does not add a second OSM pass to synthesize it.",
};

const SERVER_NOTES: Record<string, string> = {
  "osmium-gdal-tippecanoe":
    "No database. Stack: Osmium, GDAL, tippecanoe, Python/GeoPandas. Lowest moving parts for a one-off server job.",
  "osm2pgsql-postgis-direct":
    "PostgreSQL + PostGIS + osm2pgsql + SQL post-process. Higher ops surface (extensions, tuning, disk for DB).",
  "osm2pgsql-postgis-prefilter":
    "Same as direct variant plus Osmium prefilter step; smaller import, still full Postgres lifecycle in the container.",
  "planetiler-playgrounds":
    "Single JVM + `planetiler.jar`; heap scales with extract size (~0.5× PBF recommended, 1 GiB floor in script). No DB.",
};

const CI_NOTES: Record<string, string> = {
  "osmium-gdal-tippecanoe":
    "Docker on GitHub Actions: usually fine for Berlin; Germany needs enough disk/RAM on the runner. Netlify/Vercel: use only to **host** static `.pmtiles`/`.parquet` after CI builds them — not to run this extract.",
  "osm2pgsql-postgis-direct":
    "Docker on GHA: Berlin is typical; Germany stresses RAM/disk and runtime. Same Netlify note: artifact hosting only.",
  "osm2pgsql-postgis-prefilter":
    "Same runner considerations as B1; prefilter reduces import time but still needs Postgres in Docker.",
  "planetiler-playgrounds":
    "Docker on GHA: set `PLANETILER_JAVA_OPTS` if the default heap hits runner limits. Germany may need a larger runner. Netlify: host outputs only.",
};

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function stepTimeMs(p: PipelineRunResult, stepKey: string | undefined): number | undefined {
  if (!stepKey) {
    return undefined;
  }
  const raw = p.stepTimings?.steps_ms?.[stepKey];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function pmtilesSupported(p: PipelineRunResult): boolean {
  const c = p.validation?.checks as Record<string, unknown> | undefined;
  if (c && typeof c.pmtiles_exists === "boolean") {
    return c.pmtiles_exists;
  }
  const b = Number(p.validation?.pmtiles_bytes);
  return Number.isFinite(b) && b > 0;
}

function parquetSupported(p: PipelineRunResult): boolean {
  const c = p.validation?.checks as Record<string, unknown> | undefined;
  if (c && typeof c.parquet_exists === "boolean") {
    return c.parquet_exists;
  }
  const b = Number(p.validation?.parquet_bytes);
  return Number.isFinite(b) && b > 0;
}

export function buildPerPipelineProfileSections(pipelines: PipelineRunResult[]): string[] {
  const sorted = [...pipelines].sort((a, b) => a.id.localeCompare(b.id));
  const blocks: string[] = [
    "## Per-pipeline outputs and operations",
    "",
    "Single-file **tile delivery** means `playgrounds.pmtiles` (HTTP-range-friendly archive). **Analysis format** means `playgrounds.parquet` (GeoParquet). Times come from each run’s `step_timings.json` where a matching step key exists.",
    "",
  ];

  for (const p of sorted) {
    const pmKey = PMTILES_STEP_KEYS[p.id];
    const pqKey = PARQUET_STEP_KEYS[p.id];
    const pmMs = stepTimeMs(p, pmKey);
    const pqMs = stepTimeMs(p, pqKey);

    const pmYes = pmtilesSupported(p);
    const pqYes = parquetSupported(p);

    const lacking = p.validation?.lacking;
    const lackingLine =
      Array.isArray(lacking) && lacking.length > 0
        ? lacking.map((x) => (typeof x === "string" ? x : String(x))).join(", ")
        : "—";

    blocks.push(`### ${p.id}`, "");
    blocks.push(
      `- **PMTiles:** ${pmYes ? "Yes" : "No"} — ${DELIVERY_HOW[p.id] ?? "—"} — *step time:* ${pmMs !== undefined ? fmtMs(pmMs) : "—"} (${pmKey ?? "—"})`,
    );
    blocks.push(
      `- **GeoParquet:** ${pqYes ? "Yes" : "No"} — ${PARQUET_HOW[p.id] ?? "—"} — *step time:* ${pqMs !== undefined ? fmtMs(pqMs) : "—"} (${pqKey ?? "—"})`,
    );
    blocks.push(`- **Server / ops:** ${SERVER_NOTES[p.id] ?? "—"}`);
    blocks.push(`- **CI / static hosting:** ${CI_NOTES[p.id] ?? "—"}`);
    blocks.push(`- **Lacking (declared):** ${lackingLine}`);
    blocks.push("");
  }

  return blocks;
}
