import type { PipelineRunResult } from "./types";

/** Step keys in each pipeline’s `step_timings.json` → `steps_ms` (for summary timing columns). */
export const PMTILES_STEP_KEYS: Record<string, string> = {
  "osmium-gdal-tippecanoe": "export_pmtiles",
  "osm2pgsql-postgis-direct": "export_pmtiles",
  "osm2pgsql-postgis-prefilter": "export_pmtiles",
  "osm2pgsql-postgis-prefilter-osmfilter": "export_pmtiles",
  "planetiler-playgrounds": "planetiler_pmtiles",
  "cosmo-playgrounds-dual-pass": "export_pmtiles",
  "cosmo-playgrounds-single-pass": "export_pmtiles",
};

export const PARQUET_STEP_KEYS: Record<string, string | undefined> = {
  "osmium-gdal-tippecanoe": "export_geoparquet",
  "osm2pgsql-postgis-direct": "export_geoparquet",
  "osm2pgsql-postgis-prefilter": "export_geoparquet",
  "osm2pgsql-postgis-prefilter-osmfilter": "export_geoparquet",
  "planetiler-playgrounds": undefined,
  "cosmo-playgrounds-dual-pass": "export_geoparquet",
  "cosmo-playgrounds-single-pass": "export_geoparquet",
};

const DELIVERY_HOW: Record<string, string> = {
  "osmium-gdal-tippecanoe":
    "Osmium `tags-filter` → GDAL GeoJSONSeq (WGS84, 7 dp) → tippecanoe → `playgrounds.pmtiles`.",
  "osm2pgsql-postgis-direct":
    "osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`.",
  "osm2pgsql-postgis-prefilter":
    "Osmium `tags-filter` → osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`.",
  "osm2pgsql-postgis-prefilter-osmfilter":
    "`osmconvert` (PBF→o5m) → osmfilter → osm2pgsql flex → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`.",
  "planetiler-playgrounds":
    "Planetiler custommap YAML (single JVM pass) → native PMTiles writer → `playgrounds.pmtiles`.",
  "cosmo-playgrounds-dual-pass":
    "Two `cosmo convert` passes: native GeoParquet + GeoJSONL → tippecanoe → `playgrounds.pmtiles`.",
  "cosmo-playgrounds-single-pass":
    "One `cosmo convert` → GeoJSONL → `ogr2ogr` GeoJSONSeq → tippecanoe → `playgrounds.pmtiles`.",
};

const PARQUET_HOW: Record<string, string> = {
  "osmium-gdal-tippecanoe":
    "GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed).",
  "osm2pgsql-postgis-direct":
    "GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed).",
  "osm2pgsql-postgis-prefilter":
    "GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed).",
  "osm2pgsql-postgis-prefilter-osmfilter":
    "GeoPandas reads GeoJSONSeq, writes GeoParquet via PyArrow (GDAL Parquet driver not assumed).",
  "planetiler-playgrounds":
    "Not supported — Planetiler does not emit Parquet; this benchmark does not add a second OSM pass to synthesize it.",
  "cosmo-playgrounds-dual-pass":
    "Native cosmo GeoParquet (`export_geoparquet` step).",
  "cosmo-playgrounds-single-pass":
    "GeoPandas reads GDAL-normalized GeoJSONSeq, writes GeoParquet via PyArrow (single cosmo OSM read).",
};

const SERVER_NOTES: Record<string, string> = {
  "osmium-gdal-tippecanoe":
    "No database. Stack: Osmium, GDAL, tippecanoe, Python/GeoPandas. Lowest moving parts for a one-off server job.",
  "osm2pgsql-postgis-direct":
    "PostgreSQL + PostGIS + osm2pgsql + SQL post-process. Higher ops surface (extensions, tuning, disk for DB).",
  "osm2pgsql-postgis-prefilter":
    "Same as direct variant plus Osmium prefilter step; smaller import, still full Postgres lifecycle in the container.",
  "osm2pgsql-postgis-prefilter-osmfilter":
    "Same as B2 but prefilter is osmconvert + osmfilter (no Osmium); needs extra disk for full `.o5m` before filtering.",
  "planetiler-playgrounds":
    "Single JVM + `planetiler.jar`; heap scales with extract size (~0.5× PBF recommended, 1 GiB floor in script). No DB.",
  "cosmo-playgrounds-dual-pass":
    "Rust `cosmo` binary (compiled in image). No DB. Two full PBF scans for Parquet + tiles.",
  "cosmo-playgrounds-single-pass":
    "Rust `cosmo` + GDAL + GeoPandas + tippecanoe. No DB. One PBF scan; GDAL/GeoPandas add moving parts vs dual-pass native Parquet.",
};

const CI_NOTES: Record<string, string> = {
  "osmium-gdal-tippecanoe":
    "Docker on GitHub Actions: usually fine for Berlin; Germany needs enough disk/RAM on the runner. Netlify/Vercel: use only to **host** static `.pmtiles`/`.parquet` after CI builds them — not to run this extract.",
  "osm2pgsql-postgis-direct":
    "Docker on GHA: Berlin is typical; Germany stresses RAM/disk and runtime. Same Netlify note: artifact hosting only.",
  "osm2pgsql-postgis-prefilter":
    "Same runner considerations as B1; prefilter reduces import time but still needs Postgres in Docker.",
  "osm2pgsql-postgis-prefilter-osmfilter":
    "Same as B2; Germany needs enough disk for a full `.o5m` copy during `osmconvert` (osmfilter requires a seekable file).",
  "planetiler-playgrounds":
    "Docker on GHA: set `PLANETILER_JAVA_OPTS` if the default heap hits runner limits. Germany may need a larger runner. Netlify: host outputs only.",
  "cosmo-playgrounds-dual-pass":
    "First image build compiles cosmo from source. Berlin is fine on typical runners; Germany needs RAM/disk. Netlify: host outputs only.",
  "cosmo-playgrounds-single-pass":
    "Same image as dual-pass. Compare in-container totals vs dual-pass to see one-read vs two-read tradeoff.",
};

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function stepTimeMs(p: PipelineRunResult, stepKey: string | undefined): number | undefined {
  if (!stepKey) {
    return undefined;
  }
  const steps = p.stepTimings?.steps_ms;
  if (!steps) {
    return undefined;
  }
  const raw = steps[stepKey as keyof typeof steps];
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
