// One descriptor per endpoint. Path-params use `:name` placeholders that the
// client substitutes at call time. End paths with `/` only when the backend
// expects it — Go's chi router here doesn't.

export interface ApiDescriptor {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  description: string;
}

const apis = {
  health: {
    path: "/health",
    method: "GET",
    description: "Service reachability probe — powers the topbar pill.",
  },
  config: {
    path: "/config",
    method: "GET",
    description: "Loaded service config (pipeline knobs, AI adapter, storage adapter).",
  },
  feed: {
    path: "/feed",
    method: "POST",
    description: "Push one (url, html) page. Server routes to a parser by host + shape.",
  },
  force: {
    path: "/force",
    method: "POST",
    description: "Trigger a pipeline run for an existing parser, bypassing safety guards.",
  },
  regenerate: {
    path: "/regenerate",
    method: "POST",
    description: "Re-derive a parser, optionally keeping a subset of labels.",
  },
  parsers: {
    path: "/parsers",
    method: "GET",
    description: "List every parser, newest first.",
  },
  parser: {
    path: "/parser/:id",
    method: "GET",
    description: "Fetch one parser doc, with live progress hydrated when running.",
  },
  nukeParser: {
    path: "/parser/:id",
    method: "DELETE",
    description: "Wipe a parser and every artifact tied to it (corpus, feed log, runs, progress).",
  },
  parserCorpus: {
    path: "/parser/:id/corpus",
    method: "GET",
    description: "Per-page metadata for a parser's corpus (no HTML bodies).",
  },
  parserFeeds: {
    path: "/parser/:id/feeds",
    method: "GET",
    description: "Routing-decision audit log for a parser.",
  },
} as const satisfies Record<string, ApiDescriptor>;

export type ApiId = keyof typeof apis;

export default apis;
