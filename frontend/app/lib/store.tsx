"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { MOCK_CONFIG, MOCK_PARSERS, PATH_FINDER_URL_DEFAULT } from "./mockData";
import type {
  FeedQueueItem,
  ParserDoc,
  PipelineConfig,
  ToastItem,
  ToastKind,
} from "./types";

interface StoreValue {
  parsers: ParserDoc[];
  feedQueue: FeedQueueItem[];
  baseUrl: string;
  setBaseUrl: (s: string) => void;
  config: PipelineConfig;
  setConfig: (c: PipelineConfig) => void;
  toasts: ToastItem[];
  dismissToast: (id: number) => void;
  toast: (kind: ToastKind, title: string, body?: string) => void;
  feedPage: (p: { url: string; html: string }) => string;
  forceRun: (parserId: string) => void;
  regenerate: (parserId: string, opts: { labels: string[]; force: boolean }) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

// hostnameOf normalizes a URL to the bucket-key hostname (lowercased, www. stripped).
function hostnameOf(raw: string): string {
  try {
    const h = new URL(raw).hostname.toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return "";
  }
}

// fakeShapeId is a stand-in for the Rust core's FNV-1a hash of the page shape.
// The real backend assigns the id; the UI just needs a deterministic stub.
function fakeShapeId(seed: string): string {
  let h = 0x811c9dc5;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 8);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [parsers, setParsers] = useState<ParserDoc[]>(MOCK_PARSERS);
  const [feedQueue, setFeedQueue] = useState<FeedQueueItem[]>(() => [
    {
      bucket_id: "shop.example.com:a3f9c1de",
      url: "https://shop.example.com/products/87423",
      html: "<html>...</html>",
      at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    },
    {
      bucket_id: "shop.example.com:a3f9c1de",
      url: "https://shop.example.com/products/19022",
      html: "<html>...</html>",
      at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    },
  ]);
  const [baseUrl, setBaseUrl] = useState(
    process.env.NEXT_PUBLIC_PATH_FINDER_URL || PATH_FINDER_URL_DEFAULT,
  );
  const [config, setConfig] = useState(MOCK_CONFIG);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, kind, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const feedPage = useCallback(
    ({ url, html }: { url: string; html: string }) => {
      const host = hostnameOf(url);
      const bucketID = `${host}:${fakeShapeId(host + url)}`;
      setFeedQueue((q) => [
        ...q,
        { bucket_id: bucketID, url, html, at: new Date().toISOString() },
      ]);
      toast("success", "Page accepted", `parser_id: ${bucketID}`);
      setParsers((ps) => {
        const existing = ps.find((p) => p._id === bucketID);
        if (existing) {
          return ps.map((p) =>
            p._id === bucketID ? { ...p, page_count: p.page_count + 1 } : p
          );
        }
        return [
          {
            _id: bucketID,
            hostname: host,
            shape: [],
            status: "pending",
            created_at: new Date().toISOString(),
            last_triggered_at: null,
            completed_at: null,
            error: null,
            url_pattern: { host, pattern: "/?" },
            page_count: 1,
            parser: null,
          },
          ...ps,
        ];
      });
      return bucketID;
    },
    [toast]
  );

  const forceRun = useCallback(
    (parserId: string) => {
      if (!parserId) return;
      toast("info", "Force run triggered", `parser_id: ${parserId}`);
      setParsers((ps) => ps.map((p) => (p._id === parserId ? { ...p, status: "running" } : p)));
      setTimeout(() => {
        setParsers((ps) =>
          ps.map((p) =>
            p._id === parserId
              ? { ...p, status: "done", completed_at: new Date().toISOString() }
              : p
          )
        );
      }, 2200);
    },
    [toast]
  );

  const regenerate = useCallback(
    (parserId: string, { labels, force }: { labels: string[]; force: boolean }) => {
      toast(
        "info",
        "Regeneration triggered",
        `parser_id: ${parserId}${labels.length ? ` · ${labels.length} labels` : " · all labels"}${
          force ? " · force" : ""
        }`
      );
      setParsers((ps) =>
        ps.map((p) => (p._id === parserId ? { ...p, status: "running" } : p))
      );
      setTimeout(() => {
        setParsers((ps) =>
          ps.map((p) =>
            p._id === parserId
              ? { ...p, status: "done", completed_at: new Date().toISOString() }
              : p
          )
        );
      }, 2000);
    },
    [toast]
  );

  return (
    <StoreContext.Provider
      value={{
        parsers,
        feedQueue,
        baseUrl,
        setBaseUrl,
        config,
        setConfig,
        toasts,
        dismissToast,
        toast,
        feedPage,
        forceRun,
        regenerate,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
