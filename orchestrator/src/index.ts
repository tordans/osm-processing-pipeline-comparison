import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { intro, outro, spinner } from "@clack/prompts";
import { DATASETS, PIPELINES, REPO_ROOT, RESULTS_RUNS_DIR } from "./config";
import { prepareInput } from "./prepare";
import { generateSummaryFromRuns } from "./summary";
import type { BenchmarkRunReport, DatasetKey, PipelineRunResult } from "./types";

function nowMs(): number {
  return Date.now();
}

function parseArgs(argv: string[]): { command: string; dataset: DatasetKey; force: boolean } {
  const command = argv[0] ?? "help";
  const datasetArg = getArgValue(argv, "--dataset") ?? "berlin";
  const force = argv.includes("--force");

  if (datasetArg !== "berlin" && datasetArg !== "germany") {
    throw new Error(`Invalid dataset "${datasetArg}". Use berlin or germany.`);
  }

  return {
    command,
    dataset: datasetArg,
    force,
  };
}

function getArgValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= argv.length) {
    return undefined;
  }
  return argv[idx + 1];
}

function runCommand(command: string[], cwd?: string): { code: number; ms: number } {
  const start = nowMs();
  const proc = Bun.spawnSync(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  const end = nowMs();
  return { code: proc.exitCode ?? 1, ms: end - start };
}

function tailText(text: string, maxChars: number): string {
  const t = text.trimEnd();
  if (t.length <= maxChars) {
    return t;
  }
  return `…(truncated, showing last ${maxChars} chars)\n${t.slice(-maxChars)}`;
}

function runDockerContainer(command: string[]): {
  code: number;
  ms: number;
  stdout: string;
  stderr: string;
} {
  const start = nowMs();
  const proc = Bun.spawnSync(command, {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const end = nowMs();
  const stdout = new TextDecoder().decode(proc.stdout);
  const stderr = new TextDecoder().decode(proc.stderr);
  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }
  return { code: proc.exitCode ?? 1, ms: end - start, stdout, stderr };
}

async function runPipeline(
  pipeline: (typeof PIPELINES)[number],
  datasetKey: DatasetKey,
): Promise<PipelineRunResult> {
  const outputDir = join(REPO_ROOT, "data", "output", pipeline.id, datasetKey);
  const validationPath = join(outputDir, "validation.json");
  const stepTimingsPath = join(outputDir, "step_timings.json");
  await mkdir(outputDir, { recursive: true });

  const build = runCommand(["docker", "build", "-t", pipeline.imageTag, pipeline.dir], REPO_ROOT);
  if (build.code !== 0) {
    return {
      id: pipeline.id,
      imageTag: pipeline.imageTag,
      status: "failed",
      buildMs: build.ms,
      containerMs: 0,
      totalMs: build.ms,
      outputDir,
      validationPath,
      stepTimingsPath,
      error: "docker build failed",
    };
  }

  const run = runDockerContainer([
    "docker",
    "run",
    "--rm",
    "-v",
    `${REPO_ROOT}:/workspace`,
    pipeline.imageTag,
    "bash",
    "-lc",
    `${pipeline.scriptPathInWorkspace} /workspace/data/raw/${DATASETS[datasetKey].fileName} ${datasetKey}`,
  ]);

  let validation: Record<string, unknown> | undefined;
  if (existsSync(validationPath)) {
    validation = (await Bun.file(validationPath).json()) as Record<string, unknown>;
  }

  let stepTimings:
    | {
        pipeline: string;
        dataset: string;
        steps_ms: Record<string, number>;
        total_ms: number;
      }
    | undefined;

  if (existsSync(stepTimingsPath)) {
    stepTimings = (await Bun.file(stepTimingsPath).json()) as {
      pipeline: string;
      dataset: string;
      steps_ms: Record<string, number>;
      total_ms: number;
    };
  }

  const failed = run.code !== 0;

  return {
    id: pipeline.id,
    imageTag: pipeline.imageTag,
    status: failed ? "failed" : "ok",
    buildMs: build.ms,
    containerMs: run.ms,
    totalMs: build.ms + run.ms,
    outputDir,
    validationPath,
    stepTimingsPath,
    validation,
    stepTimings,
    error: failed ? "docker run failed" : undefined,
    stderrTail: failed ? tailText(run.stderr, 6000) : undefined,
  };
}

async function runAll(datasetKey: DatasetKey, force: boolean): Promise<void> {
  intro("OSM Processing Pipeline Benchmark");
  const spin = spinner();

  spin.start(`Preparing dataset: ${datasetKey}`);
  const prepared = await prepareInput(DATASETS[datasetKey], force);
  spin.stop(
    prepared.downloaded
      ? `Dataset downloaded: ${prepared.inputPath}`
      : `Dataset already cached: ${prepared.inputPath}`,
  );

  const startedAt = new Date().toISOString();
  const runId = startedAt.replaceAll(":", "-").replaceAll(".", "-");
  const results: PipelineRunResult[] = [];

  for (const pipeline of PIPELINES) {
    spin.start(`Building and running ${pipeline.id}`);
    const result = await runPipeline(pipeline, datasetKey);
    results.push(result);
    spin.stop(`${pipeline.id}: ${result.status} (${(result.totalMs / 1000).toFixed(2)}s)`);
  }

  const finishedAt = new Date().toISOString();
  const report: BenchmarkRunReport = {
    runId,
    startedAt,
    finishedAt,
    dataset: DATASETS[datasetKey],
    inputPbfPath: prepared.inputPath,
    pipelines: results,
  };

  await mkdir(RESULTS_RUNS_DIR, { recursive: true });
  const reportPath = resolve(RESULTS_RUNS_DIR, `run-${runId}-${datasetKey}.json`);
  await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  spin.start("Generating summary");
  await generateSummaryFromRuns();
  spin.stop("Summary written to results/summary.md");

  outro(`Run complete. Report: ${reportPath}`);
}

async function runPrepareOnly(datasetKey: DatasetKey, force: boolean): Promise<void> {
  intro("Prepare OSM input dataset");
  const spin = spinner();
  spin.start(`Preparing dataset: ${datasetKey}`);
  const prepared = await prepareInput(DATASETS[datasetKey], force);
  spin.stop(
    prepared.downloaded
      ? `Downloaded: ${prepared.inputPath}`
      : `Already present: ${prepared.inputPath}`,
  );
  outro(`Metadata: ${prepared.metadataPath}`);
}

async function runSummaryOnly(): Promise<void> {
  intro("Regenerate benchmark summary");
  const spin = spinner();
  spin.start("Building summary from run artifacts");
  await generateSummaryFromRuns();
  spin.stop("Summary updated");
  outro("Done");
}

function printHelp(): void {
  console.log("Usage:");
  console.log("  bun run orchestrator/src/index.ts run --dataset berlin|germany [--force]");
  console.log("  bun run orchestrator/src/index.ts prepare --dataset berlin|germany [--force]");
  console.log("  bun run orchestrator/src/index.ts summary");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, dataset, force } = parseArgs(args);

  if (command === "run") {
    await runAll(dataset, force);
    return;
  }
  if (command === "prepare") {
    await runPrepareOnly(dataset, force);
    return;
  }
  if (command === "summary") {
    await runSummaryOnly();
    return;
  }

  printHelp();
}

await main();
