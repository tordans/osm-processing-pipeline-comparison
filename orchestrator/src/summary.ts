import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildCanonicalTimingsTable,
  buildDatasetSection,
  buildRequirementsTable,
  fmtMs,
  loadAllComparisons,
} from "./comparisonReport";
import { RESULTS_RUNS_DIR, RESULTS_SUMMARY_PATH } from "./config";
import { buildPipelineFlowsChapter, pipelineLink } from "./pipelineDiagrams";
import type { BenchmarkRunReport, PipelineRunResult } from "./types";

const B2_REFERENCE_ID = "osm2pgsql-postgis-prefilter";
const CANONICAL_STEP_KEYS = [
  "filter",
  "cleanTransform",
  "exportGeoParquet",
  "exportPmtiles",
  "sqlPostprocess",
  "validate",
] as const;
const B2_OSMFILTER_ID = "osm2pgsql-postgis-prefilter-osmfilter";
const COSMO_DUAL_PASS_ID = "cosmo-playgrounds-dual-pass";
const COSMO_SINGLE_PASS_ID = "cosmo-playgrounds-single-pass";

function stepMsFromComparison(
  p: PipelineRunResult,
  comparisons: Map<string, import("./types").ComparisonArtifact | undefined>,
  key: (typeof CANONICAL_STEP_KEYS)[number],
): number | undefined {
  const t = comparisons.get(p.id)?.timingsMs;
  if (!t) {
    return undefined;
  }
  const raw = t[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

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
    return "0:00 (baseline)";
  }
  if (deltaMs < 0) {
    return `${fmtMs(-deltaMs)} faster; ${pctPhrase}`;
  }
  return `${fmtMs(deltaMs)} slower; ${pctPhrase}`;
}

function buildVsB2Section(
  pipelines: PipelineRunResult[],
  ref: PipelineRunResult | undefined,
  comparisons: Map<string, import("./types").ComparisonArtifact | undefined>,
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
  const refProc = comparisons.get(B2_REFERENCE_ID)?.timingsMs.totalInContainer;

  const ordered = [
    ref,
    ...pipelines.filter((p) => p.id !== B2_REFERENCE_ID).sort((a, b) => a.id.localeCompare(b.id)),
  ];

  for (const p of ordered) {
    if (p.id === B2_REFERENCE_ID) {
      lines.push(`| ${pipelineLink(p.id)} | baseline | baseline | baseline |`);
      continue;
    }
    const totalCell =
      p.status === "ok" ? fmtVsRef(refTotal, p.totalMs) : "— (pipeline failed)";
    const containerCell =
      p.status === "ok" ? fmtVsRef(refContainer, p.containerMs) : "—";
    let procCell = "—";
    const otherProc = comparisons.get(p.id)?.timingsMs.totalInContainer;
    if (p.status === "ok" && refProc !== undefined && otherProc !== undefined) {
      procCell = fmtVsRef(refProc, otherProc);
    } else if (p.status === "ok") {
      procCell = "— (missing timings)";
    }
    lines.push(`| ${pipelineLink(p.id)} | ${totalCell} | ${containerCell} | ${procCell} |`);
  }

  lines.push("");
  lines.push("### Comparable in-container steps (canonical `comparison.json` keys)");
  lines.push("");
  lines.push(
    "Only canonical steps with numeric timings in B2 and another pipeline; empty cells mean that pipeline has no timing for that step.",
  );
  lines.push("");

  const header = [
    "Step",
    ...pipelines
      .filter((p) => p.id !== B2_REFERENCE_ID)
      .map((p) => pipelineLink(p.id)),
  ];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);

  for (const stepKey of CANONICAL_STEP_KEYS) {
    const refStepMs = stepMsFromComparison(ref, comparisons, stepKey);
    if (refStepMs === undefined) {
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
      const otherMs = stepMsFromComparison(p, comparisons, stepKey);
      if (otherMs === undefined) {
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

function buildPrefilterNote(
  p1: PipelineRunResult | undefined,
  p2: PipelineRunResult | undefined,
  comparisons: Map<string, import("./types").ComparisonArtifact | undefined>,
): string {
  if (!p1 || !p2) {
    return "No B1/B2 pair found in this run.";
  }
  if (p1.status !== "ok" || p2.status !== "ok") {
    return "B1 and B2 must both succeed to compare prefilter impact; see errors above.";
  }

  const deltaMs = p2.totalMs - p1.totalMs;
  const relation = deltaMs < 0 ? "faster" : "slower";
  const deltaAbs = Math.abs(deltaMs);

  const p2PrefilterMs = comparisons.get(p2.id)?.timingsMs.filter ?? 0;
  const p1CleanMs = comparisons.get(p1.id)?.timingsMs.cleanTransform ?? 0;
  const p2CleanMs = comparisons.get(p2.id)?.timingsMs.cleanTransform ?? 0;
  const importDelta = p2CleanMs - p1CleanMs;

  const p1Proc = comparisons.get(p1.id)?.timingsMs.totalInContainer;
  const p2Proc = comparisons.get(p2.id)?.timingsMs.totalInContainer;
  const procDelta =
    p1Proc !== undefined && p2Proc !== undefined ? p2Proc - p1Proc : undefined;

  const lines = [
    `- **End-to-end (build + container wall):** B2 is ${fmtMs(deltaAbs)} ${relation} than B1.`,
    `- **B2 osmium prefilter:** ${fmtMs(p2PrefilterMs)}`,
    `- **Clean/transform (B2 − B1):** ${fmtMs(importDelta)}`,
  ];
  if (procDelta !== undefined) {
    lines.push(
      `- **In-container total (B2 − B1):** ${fmtMs(procDelta)} (from each pipeline’s \`comparison.json\`, excludes image build)`,
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
  comparisons: Map<string, import("./types").ComparisonArtifact | undefined>,
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

  const b2Pref = comparisons.get(b2.id)?.timingsMs.filter ?? NaN;
  const osmPref = comparisons.get(b2Osmfilter.id)?.timingsMs.filter ?? NaN;

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

function buildCosmoVariantComparisonSection(
  dual: PipelineRunResult | undefined,
  single: PipelineRunResult | undefined,
  comparisons: Map<string, import("./types").ComparisonArtifact | undefined>,
): string[] {
  if (!dual || !single) {
    return [
      "## Cosmo dual-pass vs single-pass + GDAL",
      "",
      "Both `cosmo-playgrounds-dual-pass` and `cosmo-playgrounds-single-pass` must be present in this run; skipping variant comparison.",
      "",
    ];
  }
  if (dual.status !== "ok" || single.status !== "ok") {
    return [
      "## Cosmo dual-pass vs single-pass + GDAL",
      "",
      "Both cosmo variants must succeed to compare export strategies; see errors above.",
      "",
    ];
  }

  const dualCmp = comparisons.get(dual.id);
  const singleCmp = comparisons.get(single.id);
  const dualCosmoMs =
    (dualCmp?.timingsMs.exportGeoParquet ?? 0) + (dualCmp?.timingsMs.cleanTransform ?? 0);
  const singleCosmoMs =
    (singleCmp?.timingsMs.cleanTransform ?? NaN);
  const dualFc = Number(dual.validation?.feature_count ?? NaN);
  const singleFc = Number(single.validation?.feature_count ?? NaN);
  let fcNote = "";
  if (Number.isFinite(dualFc) && Number.isFinite(singleFc) && dualFc !== singleFc) {
    fcNote = ` **Warning:** feature counts differ (dual-pass=${dualFc}, single-pass=${singleFc}).`;
  }

  const lines: string[] = [
    "## Cosmo dual-pass vs single-pass + GDAL",
    "",
    "**Dual-pass:** two `cosmo convert` runs (native GeoParquet + GeoJSONL) then tippecanoe. **Single-pass:** one `cosmo convert` → `ogr2ogr` GeoJSONSeq → GeoPandas Parquet + tippecanoe.",
    "",
    `| Metric | ${pipelineLink(dual.id, "dual-pass")} | ${pipelineLink(single.id, "single-pass")} | dual vs single |`,
    "| --- | --- | --- | --- |",
  ];

  const rows: Array<[string, number | undefined, number | undefined]> = [
    ["Total (build+run)", dual.totalMs, single.totalMs],
    ["Container wall", dual.containerMs, single.containerMs],
    ["In-container (script)", dualCmp?.timingsMs.totalInContainer, singleCmp?.timingsMs.totalInContainer],
  ];

  for (const [label, dualMs, singleMs] of rows) {
    const d = Number(dualMs);
    const s = Number(singleMs);
    const vs =
      Number.isFinite(d) && Number.isFinite(s) ? fmtVsRef(d, s) : "—";
    lines.push(
      `| ${label} | ${Number.isFinite(d) ? fmtMs(d) : "—"} | ${Number.isFinite(s) ? fmtMs(s) : "—"} | ${vs} |`,
    );
  }

  lines.push("");
  if (Number.isFinite(dualCosmoMs) && Number.isFinite(singleCosmoMs) && singleCosmoMs > 0) {
    const ratio = dualCosmoMs / singleCosmoMs;
    lines.push(
      `- **Cosmo OSM read time (dual):** ${fmtMs(dualCosmoMs)} (\`exportGeoParquet\` + \`cleanTransform\`)`,
    );
    lines.push(`- **Cosmo OSM read time (single):** ${fmtMs(singleCosmoMs)} (\`cleanTransform\`)`);
    lines.push(`- **Cosmo read ratio (dual total ÷ single):** ${ratio.toFixed(2)}×${fcNote}`);
  } else {
    lines.push("- **Cosmo OSM read time:** —");
  }

  lines.push("");
  lines.push("### Step breakdown (in-container)");
  lines.push("");
  lines.push(
    `| Step | ${pipelineLink(dual.id, "dual-pass")} | ${pipelineLink(single.id, "single-pass")} | dual vs single |`,
  );
  lines.push("| --- | --- | --- | --- |");

  for (const stepKey of CANONICAL_STEP_KEYS) {
    const d = dualCmp?.timingsMs[stepKey];
    const s = singleCmp?.timingsMs[stepKey];
    const dNum = typeof d === "number" ? d : NaN;
    const sNum = typeof s === "number" ? s : NaN;
    if (!Number.isFinite(dNum) && !Number.isFinite(sNum)) {
      continue;
    }
    const dCell = Number.isFinite(dNum) ? fmtMs(dNum) : "—";
    const sCell = Number.isFinite(sNum) ? fmtMs(sNum) : "—";
    let vs = "—";
    if (Number.isFinite(dNum) && Number.isFinite(sNum)) {
      vs = fmtVsRef(dNum, sNum);
    }
    lines.push(`| \`${stepKey}\` | ${dCell} | ${sCell} | ${vs} |`);
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
    blocks.push(`### ${pipelineLink(p.id)}`, "");
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
  const comparisons = await loadAllComparisons(pipelines);
  const b1 = pipelines.find((p) => p.id === "osm2pgsql-postgis-direct");
  const b2 = pipelines.find((p) => p.id === B2_REFERENCE_ID);
  const b2Osmfilter = pipelines.find((p) => p.id === B2_OSMFILTER_ID);
  const cosmoDual = pipelines.find((p) => p.id === COSMO_DUAL_PASS_ID);
  const cosmoSingle = pipelines.find((p) => p.id === COSMO_SINGLE_PASS_ID);
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
      `- **${pipelineLink("osmium-gdal-tippecanoe")}:** ${aFeatures} features`,
      `- **${pipelineLink("osm2pgsql-postgis-direct", "osm2pgsql B1")}:** ${b1Features} features`,
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
          warningLines.push(`- **${pipelineLink(p.id)}:** ${item.trim()}`);
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
    "## How to read this report",
    "",
    "- Timings and requirement status are read from each pipeline’s \`comparison.json\` only.",
    "- **Build** is `docker build` time on the host (one-time per image change).",
    "- **Container** is wall time for `docker run`.",
    "- **In-container total** is script wall time inside the container.",
    "- **Durations** use `M:SS` (minutes:seconds), rounded to the nearest second.",
    "- **Pipeline** names in tables link to [Pipeline flows](#pipeline-flows) below.",
    "",
    ...buildDatasetSection(comparisons),
    ...buildCanonicalTimingsTable(pipelines, comparisons),
    ...buildRequirementsTable(pipelines, comparisons),
    "",
    ...buildPipelineFlowsChapter(pipelines.map((p) => p.id)),
    ...buildVsB2Section(pipelines, b2, comparisons),
    ...buildB2VsOsmfilterSection(b2, b2Osmfilter, comparisons),
    ...buildCosmoVariantComparisonSection(cosmoDual, cosmoSingle, comparisons),
    crossCheck,
    warningsSection,
    "## B1 vs B2 (prefilter vs direct osm2pgsql)",
    "",
    buildPrefilterNote(b1, b2, comparisons),
    "",
    ...failuresSection(pipelines),
    "## Installation cost notes",
    "",
    "Image build time dominates the first run; for recurring benchmarks, compare **In-container (script)** and **Container** after images are built. Setup/install cost is documented in `results/notes/installation-costs.md` (not part of processing totals).",
    "",
    "## Raw artifacts",
    "",
    "- Per-pipeline: `data/output/<pipeline-id>/<dataset>/comparison.json`, `validation.json`, `step_timings.json`",
    "- Full run: `results/runs/*.json`",
  ];

  await Bun.write(RESULTS_SUMMARY_PATH, `${lines.join("\n")}\n`);
}
