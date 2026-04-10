import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { DATA_RAW_DIR } from "./config";
import type { DatasetConfig } from "./types";

export interface PrepareResult {
  inputPath: string;
  metadataPath: string;
  downloaded: boolean;
}

export async function prepareInput(dataset: DatasetConfig, force = false): Promise<PrepareResult> {
  await mkdir(DATA_RAW_DIR, { recursive: true });
  await mkdir(resolve(DATA_RAW_DIR, "metadata"), { recursive: true });

  const inputPath = join(DATA_RAW_DIR, dataset.fileName);
  const metadataPath = join(DATA_RAW_DIR, "metadata", `${dataset.key}.json`);
  const shouldDownload = force || !existsSync(inputPath);

  if (shouldDownload) {
    const download = Bun.spawnSync(["curl", "-fL", "-o", inputPath, dataset.url], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (download.exitCode !== 0) {
      throw new Error(`Failed to download ${dataset.url}`);
    }
  }

  const fileInfo = Bun.file(inputPath);
  const metadata = {
    dataset: dataset.key,
    source_url: dataset.url,
    file_name: dataset.fileName,
    file_path: inputPath,
    file_size_bytes: fileInfo.size,
    downloaded_at: new Date().toISOString(),
    downloaded_now: shouldDownload,
  };
  await Bun.write(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return {
    inputPath,
    metadataPath,
    downloaded: shouldDownload,
  };
}
