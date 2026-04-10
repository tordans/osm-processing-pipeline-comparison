export type DatasetKey = "berlin" | "germany";

export interface DatasetConfig {
  key: DatasetKey;
  url: string;
  fileName: string;
}

export interface StepTimings {
  [step: string]: number;
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
  validation?: Record<string, unknown>;
  stepTimings?: {
    pipeline: string;
    dataset: string;
    steps_ms: StepTimings;
    total_ms: number;
  };
  error?: string;
  /** Last lines of container stderr when docker run failed (for debugging). */
  stderrTail?: string;
}

export interface BenchmarkRunReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  dataset: DatasetConfig;
  inputPbfPath: string;
  pipelines: PipelineRunResult[];
}
