// One request() — every API call in the app goes through this. Looks the
// endpoint up by id, substitutes :path-params, attaches JSON headers,
// raises a typed error on non-2xx.

import apis, { type ApiId } from "./apis";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

interface RequestArgs<B = unknown> {
  pathParams?: Record<string, string | number>;
  query?: Record<string, string | number | undefined>;
  body?: B;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function substitutePath(path: string, params: Record<string, string | number> = {}): string {
  return path.replace(/:([a-zA-Z]+)/g, (_, key) => {
    const v = params[key];
    if (v === undefined) {
      throw new Error(`Missing path param :${key} for ${path}`);
    }
    return encodeURIComponent(String(v));
  });
}

function buildUrl(baseUrl: string, path: string, query?: RequestArgs["query"]): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  const url = new URL(trimmed + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text || undefined;
  }
}

export async function request<R = unknown>(
  baseUrl: string,
  id: ApiId,
  args: RequestArgs = {},
): Promise<R> {
  const api = apis[id];
  const path = substitutePath(api.path, args.pathParams);
  const url = buildUrl(baseUrl, path, args.query);

  // Optional timeout layered on top of the caller's signal. Both can abort
  // the request — whichever fires first wins.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (args.signal) args.signal.addEventListener("abort", onAbort, { once: true });
  if (args.timeoutMs) timer = setTimeout(() => ctrl.abort(), args.timeoutMs);

  try {
    const res = await fetch(url, {
      method: api.method,
      headers: { "Content-Type": "application/json" },
      body: args.body === undefined ? undefined : JSON.stringify(args.body),
      cache: "no-store",
      signal: ctrl.signal,
    });
    const text = await res.text();
    const body = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const msg =
        (body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : res.statusText) || `HTTP ${res.status}`;
      throw new ApiError(res.status, msg, body);
    }
    return body as R;
  } finally {
    if (timer) clearTimeout(timer);
    if (args.signal) args.signal.removeEventListener("abort", onAbort);
  }
}
