import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { PipelineConfig } from "./config";
import { DATA_RAW_DIR, DATASETS, REPO_ROOT } from "./config";
import type {
  ComparisonArtifact,
  DatasetKey,
  PipelineRunResult,
} from "./types";

const WRITE_COMPARISON_SH = join(REPO_ROOT, "pipelines", "lib", "write-comparison.sh");

export interface RunCacheRecord {
  hash: string;
  pipelineId: string;
  dataset: DatasetKey;
  completedAt: string;
  runId: string;
  buildMs: number;
  containerMs: number;
  totalMs: number;
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".DS_Store") {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }

  return files;
}

export async function computePipelineHash(
  pipeline: PipelineConfig,
  datasetKey: DatasetKey,
): Promise<string> {
  const hash = createHash("sha256");

  const pipelineFiles = await walkFiles(pipeline.dir);
  pipelineFiles.sort((a, b) =>
    relative(pipeline.dir, a).localeCompare(relative(pipeline.dir, b)),
  );

  for (const filePath of pipelineFiles) {
    hash.update(relative(pipeline.dir, filePath));
    hash.update(await readFile(filePath));
  }

  hash.update(await readFile(WRITE_COMPARISON_SH));
  hash.update(pipeline.scriptPathInWorkspace);

  const ds = DATASETS[datasetKey];
  const inputPath = join(DATA_RAW_DIR, ds.fileName);
  const inputStat = await stat(inputPath);
  hash.update(ds.fileName);
  hash.update(String(inputStat.size));
  hash.update(String(inputStat.mtimeMs));

  return hash.digest("hex");
}

export function runCachePath(outputDir: string): string {
  return join(outputDir, "run-cache.json");
}

export async function readRunCache(outputDir: string): Promise<RunCacheRecord | undefined> {
  const path = runCachePath(outputDir);
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return (await Bun.file(path).json()) as RunCacheRecord;
  } catch {
    return undefined;
  }
}

export async function writeRunCache(outputDir: string, record: RunCacheRecord): Promise<void> {
  await writeFile(runCachePath(outputDir), `${JSON.stringify(record, null, 2)}\n`);
}

export async function tryLoadCachedResult(
  pipeline: PipelineConfig,
  hash: string,
  outputDir: string,
): Promise<PipelineRunResult | undefined> {
  const cache = await readRunCache(outputDir);
  if (!cache || cache.hash !== hash) {
    return undefined;
  }

  const validationPath = join(outputDir, "validation.json");
  const stepTimingsPath = join(outputDir, "step_timings.json");
  const comparisonPath = join(outputDir, "comparison.json");

  if (
    !existsSync(validationPath) ||
    !existsSync(stepTimingsPath) ||
    !existsSync(comparisonPath)
  ) {
    return undefined;
  }

  const validation = (await Bun.file(validationPath).json()) as Record<string, unknown>;
  const stepTimings = (await Bun.file(stepTimingsPath).json()) as NonNullable<
    PipelineRunResult["stepTimings"]
  >;
  const comparison = (await Bun.file(comparisonPath).json()) as ComparisonArtifact;

  return {
    id: pipeline.id,
    imageTag: pipeline.imageTag,
    status: "ok",
    buildMs: cache.buildMs,
    containerMs: cache.containerMs,
    totalMs: cache.totalMs,
    outputDir,
    validationPath,
    stepTimingsPath,
    comparisonPath,
    validation,
    comparison,
    stepTimings,
    cached: {
      fromRunId: cache.runId,
      completedAt: cache.completedAt,
    },
  };
}
