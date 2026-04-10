import { readdirSync } from "node:fs";
import { join } from "node:path";
import { RESULTS_RUNS_DIR, RESULTS_SUMMARY_PATH } from "./config";
import { buildPerPipelineProfileSections } from "./pipelineProfiles";
import type { BenchmarkRunReport, PipelineRunResult } from "./types";

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtBytes(n: unknown): string {
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

function rowFor(p: PipelineRunResult): string {
  const fc = p.validation?.feature_count;
  const featureCount =
    typeof fc === "number" && Number.isFinite(fc) ? String(fc) : "—";
  const procMs = p.stepTimings?.total_ms;
  const procCol = procMs !== undefined ? fmtMs(procMs) : "—";
  const pq = fmtBytes(p.validation?.parquet_bytes);
  const pm = fmtBytes(p.validation?.pmtiles_bytes);
  const err = p.error ? escapeCell(p.error) : "—";
  const valOk =
    p.validation && typeof p.validation.ok === "boolean"
      ? p.validation.ok
        ? "yes"
        : "no"
      : "—";
  return `| ${p.id} | ${p.status} | ${valOk} | ${fmtMs(p.buildMs)} | ${fmtMs(p.containerMs)} | ${fmtMs(p.totalMs)} | ${procCol} | ${featureCount} | ${pq} | ${pm} | ${err} |`;
}

function buildPrefilterNote(p1?: PipelineRunResult, p2?: PipelineRunResult): string {
  if (!p1 || !p2) {
    return "No B1/B2 pair found in this run.";
  }
  if (p1.status !== "ok" || p2.status !== "ok") {
    return "B1 and B2 must both succeed to compare prefilter impact; see errors above.";
  }

  const deltaMs = p2.totalMs - p1.totalMs;
  const relation = deltaMs < 0 ? "faster" : "slower";
  const deltaAbs = Math.abs(deltaMs);

  const p2PrefilterMs = Number(p2.stepTimings?.steps_ms?.prefilter ?? 0);
  const p1ImportMs = Number(p1.stepTimings?.steps_ms?.extract_import ?? 0);
  const p2ImportMs = Number(p2.stepTimings?.steps_ms?.extract_import ?? 0);
  const importDelta = p2ImportMs - p1ImportMs;

  const p1Proc = p1.stepTimings?.total_ms;
  const p2Proc = p2.stepTimings?.total_ms;
  const procDelta =
    p1Proc !== undefined && p2Proc !== undefined ? p2Proc - p1Proc : undefined;

  const lines = [
    `- **End-to-end (build + container wall):** B2 is ${fmtMs(deltaAbs)} ${relation} than B1.`,
    `- **B2 osmium prefilter:** ${fmtMs(p2PrefilterMs)}`,
    `- **osm2pgsql import (B2 − B1):** ${fmtMs(importDelta)}`,
  ];
  if (procDelta !== undefined) {
    lines.push(
      `- **In-container script total (B2 − B1):** ${fmtMs(procDelta)} (from each pipeline’s \`step_timings.json\`, excludes image build)`,
    );
  }
  const f1 = Number((p1.validation?.feature_count as number) ?? 0);
  const f2 = Number((p2.validation?.feature_count as number) ?? 0);
  if (f1 > 0 && f2 > 0 && f1 !== f2) {
    lines.push(
      `- **Warning:** feature counts differ (B1=${f1}, B2=${f2}); prefilter or import may not be equivalent.`,
    );
  }
  return lines.join("\n");
}

function failuresSection(pipelines: PipelineRunResult[]): string[] {
  const failed = pipelines.filter((p) => p.status === "failed");
  if (failed.length === 0) {
    return ["## Failures", "", "None.", ""];
  }
  const blocks: string[] = ["## Failures", ""];
  for (const p of failed) {
    blocks.push(`### ${p.id}`, "");
    blocks.push(`- **Orchestrator error:** ${p.error ?? "unknown"}`);
    blocks.push("");
    if (p.stderrTail) {
      blocks.push("```");
      blocks.push(p.stderrTail);
      blocks.push("```");
      blocks.push("");
    }
  }
  return blocks;
}

export async function generateSummaryFromRuns(): Promise<void> {
  const files = readdirSync(RESULTS_RUNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    await Bun.write(
      RESULTS_SUMMARY_PATH,
      "# Benchmark Summary\n\nNo benchmark runs have been recorded yet.\n",
    );
    return;
  }

  const latestPath = join(RESULTS_RUNS_DIR, files[files.length - 1]);
  const latest = (await Bun.file(latestPath).json()) as BenchmarkRunReport;

  const pipelines = [...latest.pipelines].sort((a, b) => a.id.localeCompare(b.id));
  const b1 = pipelines.find((p) => p.id === "osm2pgsql-postgis-direct");
  const b2 = pipelines.find((p) => p.id === "osm2pgsql-postgis-prefilter");
  const okCount = pipelines.filter((p) => p.status === "ok").length;

  const pipelineA = pipelines.find((p) => p.id === "osmium-gdal-tippecanoe");
  const b1Features = b1?.validation?.feature_count;
  const aFeatures = pipelineA?.validation?.feature_count;
  let crossCheck = "";
  if (
    typeof aFeatures === "number" &&
    typeof b1Features === "number" &&
    aFeatures > 0 &&
    b1Features > 0 &&
    aFeatures !== b1Features
  ) {
    const pct = (((aFeatures - b1Features) / b1Features) * 100).toFixed(1);
    crossCheck = [
      "## Cross-pipeline sanity (feature counts)",
      "",
      `- **osmium-gdal-tippecanoe:** ${aFeatures} features`,
      `- **osm2pgsql (B1, representative):** ${b1Features} features`,
      `- **Delta:** ${aFeatures - b1Features} (${pct}% vs B1). Different OSM-to-geometry assembly (GDAL OSM driver vs osm2pgsql flex) commonly yields small count differences; B1 and B2 should match when the extract is equivalent.`,
      "",
    ].join("\n");
  }

  const warningLines: string[] = [];
  for (const p of pipelines) {
    const w = p.validation?.warnings;
    if (Array.isArray(w) && w.length > 0) {
      for (const item of w) {
        if (typeof item === "string" && item.trim()) {
          warningLines.push(`- **${p.id}:** ${item.trim()}`);
        }
      }
    }
  }
  const warningsSection =
    warningLines.length > 0
      ? ["## Validation warnings", "", ...warningLines, ""].join("\n")
      : "";

  const lines = [
    "# Benchmark Summary",
    "",
    `Generated from run artifact: \`${latestPath}\``,
    "",
    `- **Run ID:** \`${latest.runId}\``,
    `- **Dataset:** \`${latest.dataset.key}\``,
    `- **Input:** \`${latest.inputPbfPath}\``,
    `- **Window:** \`${latest.startedAt}\` → \`${latest.finishedAt}\``,
    `- **Pipelines OK:** ${okCount} / ${pipelines.length}`,
    "",
    "## How to read this table",
    "",
    "- **Build** is `docker build` time on the host (one-time per image change).",
    "- **Container** is wall time for `docker run` (includes download/cache effects on first use).",
    "- **In-container (script)** comes from each pipeline’s \`step_timings.json\` and reflects work inside the container only.",
    "- **Val OK** reflects \`validation.json\` → \`ok\` from each pipeline run.",
    "",
    "## Latest run — timings and outputs",
    "",
    "| Pipeline | Status | Val OK | Build | Container | Total (build+run) | In-container (script) | Features | Parquet | PMTiles | Error |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...pipelines.map((p) => rowFor(p)),
    "",
    crossCheck,
    warningsSection,
    ...buildPerPipelineProfileSections(pipelines),
    "## B1 vs B2 (prefilter vs direct osm2pgsql)",
    "",
    buildPrefilterNote(b1, b2),
    "",
    ...failuresSection(pipelines),
    "## Installation cost notes",
    "",
    "Image build time dominates the first run; for recurring benchmarks, compare **In-container (script)** and **Container** after images are built. Setup/install cost is documented in `results/notes/installation-costs.md` (not part of processing totals).",
    "",
    "## Raw artifacts",
    "",
    "- Per-pipeline: `data/output/<pipeline-id>/<dataset>/validation.json` and `step_timings.json`",
    "- Full run: `results/runs/*.json`",
  ];

  await Bun.write(RESULTS_SUMMARY_PATH, `${lines.join("\n")}\n`);
}
