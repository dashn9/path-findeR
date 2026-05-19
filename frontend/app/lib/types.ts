export type ParserStatus = "pending" | "running" | "done" | "failed";

export interface LabelDef {
  selectors: { css: string }[];
  concrete_types?: string[];
  abstract_types?: string[];
  array: boolean;
  unresolved: boolean;
}

export type ParserState = "forming" | "stable";

export interface StageEvent {
  stage: number;
  name: string;
  at_ms: number;
}

export interface ProgressView {
  stage: number;
  total: number;
  name: string;
  started_at_ms: number;
  updated_at_ms: number;
  events: StageEvent[];
}

export interface RunLog {
  started_at: string;
  completed_at: string;
  status: ParserStatus;
  failed_stage?: number;
  error?: string;
  events: StageEvent[];
}

export interface ParserDoc {
  _id: string;
  hostname: string;
  url_tokens: string[];
  url_seg_count: number;
  state: ParserState;
  shape_refs?: { paths: string[]; marks: string[] }[];
  status: ParserStatus;
  created_at: string;
  last_triggered_at: string | null;
  completed_at: string | null;
  error: string | null;
  url_pattern?: { host: string; pattern: string };
  page_count: number;
  parser: Record<string, LabelDef> | null;
  runs?: RunLog[];
  progress?: ProgressView;
  trace?: ParserTrace;
}

export interface FeedQueueItem {
  parser_id: string;
  url: string;
  html: string;
  at: string;
}

export interface CorpusPage {
  url: string;
  index: number;
  fetched_at: string;
}

export type FeedOutcome = "matched" | "created";

export interface FeedCandidate {
  parser_id: string;
  score: number;
  state: string;
  page_count: number;
  accepted: boolean;
}

export interface FeedDecision {
  _id: string;
  at: string;
  url: string;
  hostname: string;
  tokens: string[];
  shape: { path_count: number; mark_count: number };
  threshold: number;
  candidates: FeedCandidate[];
  outcome: FeedOutcome;
  parser_id: string;
  page_index: number;
}

// Mirrors handlers.PipelineView on the Go side. Field-for-field, snake_case.
export interface PipelineView {
  min_pages: number;
  max_direct_kb: number;
  top_n_nodes: number;
  max_sentences: number;
  max_sentence_chars: number;
  similarity_threshold: number;
  shape_similarity_threshold: number;
  max_retries: number;
  output_format: string;
  exclusions: string[];
  rerun_cooldown_seconds: number;
}

export interface AIView {
  adapter: string;
  model: string;
  base_url: string;
  has_key: boolean;
}

export interface StorageView {
  adapter: string;
  progress_dir: string;
}

export interface ConfigView {
  pipeline: PipelineView;
  ai: AIView;
  storage: StorageView;
}

export interface ActivityEvent {
  t: string;
  kind: string;
  payload: string;
}

export interface CandidateSel {
  score: number;
  css: string;
  note: string;
}

export interface DomLine {
  i: number;
  t: string;
  match?: boolean;
}

export interface LabelTrace {
  rationale: string;
  candidates: CandidateSel[];
  chosen: number;
  unresolved?: boolean;
  validation: number[][];
  dom: DomLine[];
  values: string[];
}

export interface ParserTrace {
  activity: ActivityEvent[];
  pages: { url: string; short: string }[];
  labels: Record<string, LabelTrace>;
}

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

