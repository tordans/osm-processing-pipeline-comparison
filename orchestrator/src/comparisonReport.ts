import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ComparisonArtifact, PipelineRunResult, RequirementStatus } from "./types";

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return "—";
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

export function fmtBytes(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) {
    return "—";
  }
  if (v < 1024) {
    return `${v} B`;
  }
  if (v < 1024 * 1024) {
    return `${(v / 1024).toFixed(1)} KiB`;
  }
  return `${(v / (1024 * 1024)).toFixed(2)} MiB`;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export async function loadComparisonArtifact(
  p: PipelineRunResult,
): Promise<ComparisonArtifact | undefined> {
  if (p.comparison) {
    return p.comparison;
  }
  const path = p.comparisonPath ?? join(p.outputDir, "comparison.json");
  if (!existsSync(path)) {
    return undefined;
  }
  return (await Bun.file(path).json()) as ComparisonArtifact;
}

function reqCell(req: RequirementStatus | undefined): string {
  if (!req) {
    return "—";
  }
  if (req.matched) {
    return "yes";
  }
  const reason = req.reasonIfNotMatched?.trim();
  return reason ? `no (${escapeCell(reason)})` : "no";
}

export function buildCanonicalTimingsTable(
  pipelines: PipelineRunResult[],
  comparisons: Map<string, ComparisonArtifact | undefined>,
): string[] {
  const lines = [
    "## Comparable timings and requirements",
    "",
    "All values come from each pipeline’s `comparison.json` (canonical schema). `—` means the step is not applicable for that pipeline.",
    "",
    "| Pipeline | Dataset | Input PBF | Filter | Clean/transform | GeoParquet | PMTiles | SQL postprocess | Validate | In-container total | Build | Container | Total |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const p of pipelines) {
    const c = comparisons.get(p.id);
    const t = c?.timingsMs;
    const ds = c?.dataset;
    lines.push(
      `| ${p.id} | ${ds?.name ?? "—"} | ${ds?.inputPath ? escapeCell(ds.inputPath) : "—"} | ${fmtMs(t?.filter ?? null)} | ${fmtMs(t?.cleanTransform ?? null)} | ${fmtMs(t?.exportGeoParquet ?? null)} | ${fmtMs(t?.exportPmtiles ?? null)} | ${fmtMs(t?.sqlPostprocess ?? null)} | ${fmtMs(t?.validate ?? null)} | ${fmtMs(t?.totalInContainer ?? null)} | ${fmtMs(p.buildMs)} | ${fmtMs(p.containerMs)} | ${fmtMs(p.totalMs)} |`,
    );
  }

  lines.push("");
  return lines;
}

export function buildRequirementsTable(
  pipelines: PipelineRunResult[],
  comparisons: Map<string, ComparisonArtifact | undefined>,
): string[] {
  const lines = [
    "### Core requirements",
    "",
    "| Pipeline | 1. GeoParquet | 2. PMTiles | 3. Filter/clean/confirmed | 4. SQL postprocess/confirmed | Val OK | Features | Parquet | PMTiles |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const p of pipelines) {
    const c = comparisons.get(p.id);
    const r = c?.requirements;
    const q = c?.quality;
    const a = c?.artifacts;
    lines.push(
      `| ${p.id} | ${reqCell(r?.generateGeoParquet)} | ${reqCell(r?.generatePmtiles)} | ${reqCell(r?.filterCleanConfirmed)} | ${reqCell(r?.sqlPostprocessCleanConfirmed)} | ${q?.validationOk === true ? "yes" : q?.validationOk === false ? "no" : "—"} | ${q?.featureCount ?? "—"} | ${fmtBytes(a?.geoParquetBytes)} | ${fmtBytes(a?.pmtilesBytes)} |`,
    );
  }

  lines.push("");
  return lines;
}

export function buildDatasetSection(
  comparisons: Map<string, ComparisonArtifact | undefined>,
): string[] {
  const first = [...comparisons.values()].find((c) => c?.dataset);
  if (!first?.dataset) {
    return [];
  }
  return [
    "## Dataset used for this run",
    "",
    `- **Name:** \`${first.dataset.name}\``,
    `- **Input path:** \`${first.dataset.inputPath}\``,
    `- **Source URL:** ${first.dataset.sourceUrl || "—"}`,
    "",
  ];
}

export async function loadAllComparisons(
  pipelines: PipelineRunResult[],
): Promise<Map<string, ComparisonArtifact | undefined>> {
  const map = new Map<string, ComparisonArtifact | undefined>();
  for (const p of pipelines) {
    map.set(p.id, await loadComparisonArtifact(p));
  }
  return map;
}
