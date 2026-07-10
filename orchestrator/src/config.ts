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
    id: "roads-bikelanes-osm2pgsql-prefilter-osmium",
    imageTag: "osm-benchmark-roads-bikelanes-osm2pgsql:latest",
    dir: resolve(REPO_ROOT, "pipelines", "roads-bikelanes-osm2pgsql"),
    scriptPathInWorkspace:
      "/workspace/pipelines/roads-bikelanes-osm2pgsql/scripts/run-prefilter-osmium.sh",
  },
  {
    id: "roads-bikelanes-osm2pgsql-direct",
    imageTag: "osm-benchmark-roads-bikelanes-osm2pgsql:latest",
    dir: resolve(REPO_ROOT, "pipelines", "roads-bikelanes-osm2pgsql"),
    scriptPathInWorkspace: "/workspace/pipelines/roads-bikelanes-osm2pgsql/scripts/run-direct.sh",
  },
  {
    id: "roads-bikelanes-osmnexus-postgis",
    imageTag: "osm-benchmark-roads-bikelanes-osmnexus:latest",
    dir: resolve(REPO_ROOT, "pipelines", "roads-bikelanes-osmnexus"),
    scriptPathInWorkspace: "/workspace/pipelines/roads-bikelanes-osmnexus/scripts/run-postgis.sh",
  },
  {
    id: "roads-bikelanes-osmnexus-geojsonseq",
    imageTag: "osm-benchmark-roads-bikelanes-osmnexus:latest",
    dir: resolve(REPO_ROOT, "pipelines", "roads-bikelanes-osmnexus"),
    scriptPathInWorkspace:
      "/workspace/pipelines/roads-bikelanes-osmnexus/scripts/run-geojsonseq.sh",
  },
];
