export type ParserStatus = "pending" | "running" | "done" | "failed";

export interface LabelDef {
  selectors: { css: string }[];
  concrete_types?: string[];
  abstract_types?: string[];
  array: boolean;
  unresolved: boolean;
}

export interface ParserDoc {
  _id: string;
  hostname: string;
  shape: string[];
  status: ParserStatus;
  stage?: number;
  fail_stage?: number;
  created_at: string;
  last_triggered_at: string | null;
  completed_at: string | null;
  error: string | null;
  url_pattern: { host: string; pattern: string };
  page_count: number;
  parser: Record<string, LabelDef> | null;
}

export interface FeedQueueItem {
  bucket_id: string;
  url: string;
  html: string;
  at: string;
}

export interface PipelineConfig {
  ai_endpoint: string;
  ai_model: string;
  max_direct_kb: number;
  top_n_nodes: number;
  max_sentences: number;
  max_sentence_chars: number;
  similarity_threshold: number;
  max_retries: number;
  output_format: string;
  exclusions: string[];
  min_pages: number;
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

export type Route =
  | { name: "feed" }
  | { name: "history" }
  | { name: "settings" }
  | { name: "parser"; id: string };
