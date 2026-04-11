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

const B2_REFERENCE_ID = "osm2pgsql-postgis-prefilter";
const B2_OSMFILTER_ID = "osm2pgsql-postgis-prefilter-osmfilter";

/** Step keys that exist in B2 and at least one other pipeline (for like-for-like deltas). */
const COMPARABLE_STEP_KEYS = [
  "export_geoparquet",
  "export_pmtiles",
  "validate",
] as const;

function compareToRefMs(refMs: number, otherMs: number): { deltaMs: number; pctPhrase: string } {
  const deltaMs = otherMs - refMs;
  if (!Number.isFinite(refMs) || refMs <= 0 || !Number.isFinite(otherMs)) {
    return { deltaMs: NaN, pctPhrase: "—" };
  }
  if (deltaMs === 0) {
    return { deltaMs: 0, pctPhrase: "same as reference" };
  }
  if (otherMs < refMs) {
    const pctLess = ((refMs - otherMs) / refMs) * 100;
    return { deltaMs, pctPhrase: `${pctLess.toFixed(1)}% less time than reference` };
  }
  const pctMore = ((otherMs - refMs) / refMs) * 100;
  return { deltaMs, pctPhrase: `${pctMore.toFixed(1)}% more time than reference` };
}

function fmtVsRef(refMs: number, otherMs: number): string {
  const { deltaMs, pctPhrase } = compareToRefMs(refMs, otherMs);
  if (Number.isNaN(deltaMs)) {
    return "—";
  }
  if (deltaMs === 0) {
    return "0s (baseline)";
  }
  if (deltaMs < 0) {
    return `${fmtMs(-deltaMs)} faster; ${pctPhrase}`;
  }
  return `${fmtMs(deltaMs)} slower; ${pctPhrase}`;
}

function buildVsB2Section(
  pipelines: PipelineRunResult[],
  ref: PipelineRunResult | undefined,
): string[] {
  if (!ref) {
    return [
      "## vs osm2pgsql + Osmium prefilter (B2 reference)",
      "",
      "`osm2pgsql-postgis-prefilter` was not present in this run; skipping reference comparison.",
      "",
    ];
  }
  if (ref.status !== "ok") {
    return [
      "## vs osm2pgsql + Osmium prefilter (B2 reference)",
      "",
      "B2 did not complete successfully (`status` ≠ ok); reference comparison omitted.",
      "",
    ];
  }

  const lines: string[] = [
    "## vs osm2pgsql + Osmium prefilter (B2 reference)",
    "",
    "Baseline: **osm2pgsql-postgis-prefilter** (Osmium `tags-filter` + osm2pgsql → PostGIS → exports). Other pipelines show wall-time deltas and relative duration vs that baseline.",
    "",
    "| Pipeline | Total (build+run) vs B2 | Container vs B2 | In-container (script) vs B2 |",
    "| --- | --- | --- | --- |",
  ];

  const refTotal = ref.totalMs;
  const refContainer = ref.containerMs;
  const refProc = ref.stepTimings?.total_ms;

  const ordered = [
    ref,
    ...pipelines.filter((p) => p.id !== B2_REFERENCE_ID).sort((a, b) => a.id.localeCompare(b.id)),
  ];

  for (const p of ordered) {
    if (p.id === B2_REFERENCE_ID) {
      lines.push(`| ${p.id} | baseline | baseline | baseline |`);
      continue;
    }
    const totalCell =
      p.status === "ok" ? fmtVsRef(refTotal, p.totalMs) : "— (pipeline failed)";
    const containerCell =
      p.status === "ok" ? fmtVsRef(refContainer, p.containerMs) : "—";
    let procCell = "—";
    if (p.status === "ok" && refProc !== undefined && p.stepTimings?.total_ms !== undefined) {
      procCell = fmtVsRef(refProc, p.stepTimings.total_ms);
    } else if (p.status === "ok") {
      procCell = "— (missing timings)";
    }
    lines.push(`| ${p.id} | ${totalCell} | ${containerCell} | ${procCell} |`);
  }

  lines.push("");
  lines.push("### Comparable in-container steps (same `step_timings.json` keys as B2)");
  lines.push("");
  lines.push(
    "Only steps emitted under the same name in B2 and another pipeline; empty cells mean that pipeline has no matching step.",
  );
  lines.push("");

  const header = ["Step", ...pipelines.filter((p) => p.id !== B2_REFERENCE_ID).map((p) => p.id)];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);

  const refSteps = ref.stepTimings?.steps_ms ?? {};
  for (const stepKey of COMPARABLE_STEP_KEYS) {
    const refStepMs = Number(refSteps[stepKey as string]);
    if (!Number.isFinite(refStepMs)) {
      continue;
    }
    const cells: string[] = [stepKey];
    for (const p of pipelines) {
      if (p.id === B2_REFERENCE_ID) {
        continue;
      }
      if (p.status !== "ok") {
        cells.push("—");
        continue;
      }
      const otherMs = Number(p.stepTimings?.steps_ms?.[stepKey as string]);
      if (!Number.isFinite(otherMs)) {
        cells.push("—");
        continue;
      }
      cells.push(fmtVsRef(refStepMs, otherMs));
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }

  lines.push("");
  return lines;
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

function buildB2VsOsmfilterSection(
  b2: PipelineRunResult | undefined,
  b2Osmfilter: PipelineRunResult | undefined,
): string[] {
  if (!b2 || !b2Osmfilter) {
    return [
      "## B2 vs osmfilter prefilter (Osmium vs osmctools)",
      "",
      "`osm2pgsql-postgis-prefilter` and/or `osm2pgsql-postgis-prefilter-osmfilter` were not present in this run; skipping Osmium vs osmfilter comparison.",
      "",
    ];
  }
  if (b2.status !== "ok" || b2Osmfilter.status !== "ok") {
    return [
      "## B2 vs osmfilter prefilter (Osmium vs osmctools)",
      "",
      "Both B2 and the osmfilter pipeline must succeed to compare prefilter tools; see errors above.",
      "",
    ];
  }

  const b2Pref = Number(b2.stepTimings?.steps_ms?.prefilter ?? NaN);
  const osmPref = Number(b2Osmfilter.stepTimings?.steps_ms?.prefilter ?? NaN);
  const conv = Number(b2Osmfilter.stepTimings?.steps_ms?.prefilter_convert ?? NaN);
  const filt = Number(b2Osmfilter.stepTimings?.steps_ms?.prefilter_osmfilter ?? NaN);

  const b2Fc = Number(b2.validation?.feature_count ?? NaN);
  const osmFc = Number(b2Osmfilter.validation?.feature_count ?? NaN);
  let fcNote = "";
  if (Number.isFinite(b2Fc) && Number.isFinite(osmFc) && b2Fc !== osmFc) {
    fcNote = ` **Warning:** feature counts differ (B2=${b2Fc}, osmfilter pipeline=${osmFc}); filters may not be fully equivalent.`;
  }

  const lines: string[] = [
    "## B2 vs osmfilter prefilter (Osmium vs osmctools)",
    "",
    "Same downstream steps as B2; only the prefilter differs: **B2** uses Osmium `tags-filter` on PBF; **osmfilter pipeline** uses `osmconvert` (full PBF→`.o5m`) then `osmfilter` (see [osmium-tool#253](https://github.com/osmcode/osmium-tool/issues/253)).",
    "",
  ];

  if (Number.isFinite(b2Pref)) {
    lines.push(`- **B2 prefilter (Osmium):** ${fmtMs(b2Pref)}`);
  } else {
    lines.push("- **B2 prefilter (Osmium):** —");
  }

  if (Number.isFinite(osmPref)) {
    lines.push(`- **osmfilter pipeline prefilter (total):** ${fmtMs(osmPref)}`);
  } else {
    lines.push("- **osmfilter pipeline prefilter (total):** —");
  }

  if (Number.isFinite(conv) && Number.isFinite(filt)) {
    lines.push(
      `  - *split:* \`osmconvert\` ${fmtMs(conv)} + \`osmfilter\` ${fmtMs(filt)}`,
    );
  }

  if (
    Number.isFinite(b2Pref) &&
    b2Pref > 0 &&
    Number.isFinite(osmPref) &&
    osmPref > 0
  ) {
    const ratio = osmPref / b2Pref;
    lines.push(
      `- **Prefilter ratio (osmfilter total ÷ B2 Osmium):** ${ratio.toFixed(2)}×${fcNote}`,
    );
  } else {
    lines.push(`- **Prefilter ratio:** —${fcNote}`);
  }

  lines.push("");
  return lines;
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
  const b2 = pipelines.find((p) => p.id === B2_REFERENCE_ID);
  const b2Osmfilter = pipelines.find((p) => p.id === B2_OSMFILTER_ID);
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
    ...buildVsB2Section(pipelines, b2),
    ...buildB2VsOsmfilterSection(b2, b2Osmfilter),
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
