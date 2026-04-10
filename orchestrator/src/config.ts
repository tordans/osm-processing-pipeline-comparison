import { resolve } from "node:path";
import type { DatasetConfig, DatasetKey } from "./types";

export const REPO_ROOT = resolve(import.meta.dir, "..", "..");
export const DATA_RAW_DIR = resolve(REPO_ROOT, "data", "raw");
export const RESULTS_RUNS_DIR = resolve(REPO_ROOT, "results", "runs");
export const RESULTS_SUMMARY_PATH = resolve(REPO_ROOT, "results", "summary.md");

export const DATASETS: Record<DatasetKey, DatasetConfig> = {
  berlin: {
    key: "berlin",
    url: "https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf",
    fileName: "berlin-latest.osm.pbf",
  },
  germany: {
    key: "germany",
    url: "https://download.geofabrik.de/europe/germany-latest.osm.pbf",
    fileName: "germany-latest.osm.pbf",
  },
};

export interface PipelineConfig {
  id: string;
  imageTag: string;
  dir: string;
  scriptPathInWorkspace: string;
}

export const PIPELINES: PipelineConfig[] = [
  {
    id: "osmium-gdal-tippecanoe",
    imageTag: "osm-benchmark-pipeline-a:latest",
    dir: resolve(REPO_ROOT, "pipelines", "osmium-gdal-tippecanoe"),
    scriptPathInWorkspace: "/workspace/pipelines/osmium-gdal-tippecanoe/scripts/run.sh",
  },
  {
    id: "osm2pgsql-postgis-direct",
    imageTag: "osm-benchmark-pipeline-b1:latest",
    dir: resolve(REPO_ROOT, "pipelines", "osm2pgsql-postgis-direct"),
    scriptPathInWorkspace: "/workspace/pipelines/osm2pgsql-postgis-direct/scripts/run.sh",
  },
  {
    id: "osm2pgsql-postgis-prefilter",
    imageTag: "osm-benchmark-pipeline-b2:latest",
    dir: resolve(REPO_ROOT, "pipelines", "osm2pgsql-postgis-prefilter"),
    scriptPathInWorkspace: "/workspace/pipelines/osm2pgsql-postgis-prefilter/scripts/run.sh",
  },
  {
    id: "planetiler-playgrounds",
    imageTag: "osm-benchmark-pipeline-planetiler:latest",
    dir: resolve(REPO_ROOT, "pipelines", "planetiler-playgrounds"),
    scriptPathInWorkspace: "/workspace/pipelines/planetiler-playgrounds/scripts/run.sh",
  },
];
