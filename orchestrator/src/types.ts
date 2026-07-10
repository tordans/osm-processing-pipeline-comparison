export type DatasetKey = "berlin" | "germany";

export interface DatasetConfig {
  key: DatasetKey;
  url: string;
  fileName: string;
}

export interface RequirementStatus {
  matched: boolean;
  reasonIfNotMatched: string | null;
}

export interface ComparisonArtifact {
  pipelineId: string;
  dataset: {
    name: string;
    inputPath: string;
    sourceUrl: string;
  };
  timingsMs: {
    filter: number | null;
    cleanTransform: number | null;
    exportGeoParquet: number | null;
    exportPmtiles: number | null;
    sqlPostprocess: number | null;
    validate: number | null;
    totalInContainer: number;
  };
  requirements: {
    generateGeoParquet: RequirementStatus;
    generatePmtiles: RequirementStatus;
    filterCleanConfirmed: RequirementStatus;
    sqlPostprocessCleanConfirmed: RequirementStatus;
  };
  artifacts: {
    geoParquetPath: string;
    geoParquetBytes: number;
    pmtilesPath: string;
    pmtilesBytes: number;
  };
  quality: {
    validationOk: boolean;
    featureCount: number | null;
    notes: string[];
  };
}

export interface StepTimings {
  filter?: number | null;
  cleanTransform?: number | null;
  exportGeoParquet?: number | null;
  exportPmtiles?: number | null;
  sqlPostprocess?: number | null;
  validate?: number | null;
}

export interface PipelineRunResult {
  id: string;
  imageTag: string;
  status: "ok" | "failed";
  buildMs: number;
  containerMs: number;
  totalMs: number;
  outputDir: string;
  validationPath: string;
  stepTimingsPath: string;
  comparisonPath: string;
  validation?: Record<string, unknown>;
  comparison?: ComparisonArtifact;
  stepTimings?: {
    pipeline: string;
    dataset: string;
    steps_ms: Record<string, number | null>;
    total_ms: number;
  };
  error?: string;
  /** Last lines of container stderr when docker run failed (for debugging). */
  stderrTail?: string;
  /** Present when this result was reused from a prior successful run (no docker build/run). */
  cached?: {
    fromRunId: string;
    completedAt: string;
  };
}

export interface BenchmarkRunReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  dataset: DatasetConfig;
  inputPbfPath: string;
  pipelines: PipelineRunResult[];
}
