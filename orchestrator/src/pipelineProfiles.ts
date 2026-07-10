import type { PipelineRunResult } from "./types";

/** Step keys in each pipeline’s `step_timings.json` → `steps_ms` (for summary timing columns). */
export const PMTILES_STEP_KEYS: Record<string, string> = {
  "roads-bikelanes-osm2pgsql-prefilter-osmium": "exportPmtiles",
  "roads-bikelanes-osm2pgsql-direct": "exportPmtiles",
  "roads-bikelanes-osmnexus-postgis": "exportPmtiles",
  "roads-bikelanes-osmnexus-geojsonseq": "exportPmtiles",
};

export const PARQUET_STEP_KEYS: Record<string, string | undefined> = {
  "roads-bikelanes-osm2pgsql-prefilter-osmium": "exportGeoParquet",
  "roads-bikelanes-osm2pgsql-direct": "exportGeoParquet",
  "roads-bikelanes-osmnexus-postgis": "exportGeoParquet",
  "roads-bikelanes-osmnexus-geojsonseq": "exportGeoParquet",
};

const DELIVERY_HOW: Record<string, string> = {
  "roads-bikelanes-osm2pgsql-prefilter-osmium":
    "Osmium `tags-filter w/highway` → osm2pgsql flex (tilda-geo roads_bikelanes) → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `bikelanes.pmtiles`.",
  "roads-bikelanes-osm2pgsql-direct":
    "Full PBF osm2pgsql flex (tilda-geo roads_bikelanes) → PostGIS SQL → `ogr2ogr` GeoJSONSeq → tippecanoe → `bikelanes.pmtiles`.",
  "roads-bikelanes-osmnexus-postgis":
    "OSMnexus `pg` import (filters while reading) → PostGIS SQL offset/cleanup → `ogr2ogr` GeoJSONSeq → tippecanoe → `bikelanes.pmtiles`.",
  "roads-bikelanes-osmnexus-geojsonseq":
    "OSMnexus streamed GeoJSONSeq (filters while reading) → GeoPandas Parquet + tippecanoe → `bikelanes.pmtiles`.",
};

const PARQUET_HOW: Record<string, string> = {
  "roads-bikelanes-osm2pgsql-prefilter-osmium":
    "GeoPandas reads `bikelanes.ndjson`, writes `bikelanes.parquet` via PyArrow.",
  "roads-bikelanes-osm2pgsql-direct":
    "GeoPandas reads `bikelanes.ndjson`, writes `bikelanes.parquet` via PyArrow.",
  "roads-bikelanes-osmnexus-postgis":
    "GeoPandas reads `bikelanes.ndjson`, writes `bikelanes.parquet` via PyArrow.",
  "roads-bikelanes-osmnexus-geojsonseq":
    "GeoPandas reads streamed NDJSON, writes `bikelanes.parquet` via PyArrow.",
};

const SERVER_NOTES: Record<string, string> = {
  "roads-bikelanes-osm2pgsql-prefilter-osmium":
    "PostgreSQL + PostGIS + osm2pgsql 2.3+ flex Lua (vendored tilda-geo). Osmium prefilter shrinks import; pseudo-tag CSVs stubbed in benchmark.",
  "roads-bikelanes-osm2pgsql-direct":
    "Same stack as prefilter variant without Osmium step; full highway ways imported from raw PBF.",
  "roads-bikelanes-osmnexus-postgis":
    "PostgreSQL + PostGIS + OSMnexus classifier import; SQL post-process for bikelane offsets.",
  "roads-bikelanes-osmnexus-geojsonseq":
    "Rust OSMnexus streaming export + Python/GeoPandas + tippecanoe. No database.",
};

const CI_NOTES: Record<string, string> = {
  "roads-bikelanes-osm2pgsql-prefilter-osmium":
    "Docker on GHA: Berlin is typical; Germany needs RAM/disk for Postgres + osm2pgsql. Bind-mount repo for Lua/SQL iteration without rebuild.",
  "roads-bikelanes-osm2pgsql-direct":
    "Same image as prefilter variant; longer osm2pgsql import on full PBF.",
  "roads-bikelanes-osmnexus-postgis":
    "Docker on GHA: first build compiles OSMnexus; Postgres in-container for Berlin-sized extracts.",
  "roads-bikelanes-osmnexus-geojsonseq":
    "Same image as postgis variant; no Postgres lifecycle; memory scales with extract.",
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
    "Single-file **tile delivery** means `bikelanes.pmtiles` (HTTP-range-friendly archive). **Analysis format** means `bikelanes.parquet` (GeoParquet). Times come from each run’s `step_timings.json` where a matching step key exists.",
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
