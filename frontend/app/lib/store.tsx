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
  feedPage: (p: { job_id: string; url: string; html: string }) => void;
  forceRun: (jobId: string) => void;
  regenerate: (parserId: string, opts: { labels: string[]; force: boolean }) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [parsers, setParsers] = useState<ParserDoc[]>(MOCK_PARSERS);
  const [feedQueue, setFeedQueue] = useState<FeedQueueItem[]>(() => [
    {
      job_id: "a3f9c1",
      url: "https://shop.example.com/products/87423",
      html: "<html>...</html>",
      at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    },
    {
      job_id: "a3f9c1",
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
    ({ job_id, url, html }: { job_id: string; url: string; html: string }) => {
      setFeedQueue((q) => [...q, { job_id, url, html, at: new Date().toISOString() }]);
      toast("success", "Page accepted", `job_id: ${job_id}`);
      setParsers((ps) => {
        if (ps.find((p) => p._id === job_id)) return ps;
        let host = "";
        try {
          host = new URL(url).host;
        } catch {}
        return [
          {
            _id: job_id,
            job_id,
            status: "pending",
            created_at: new Date().toISOString(),
            completed_at: null,
            error: null,
            url_pattern: { host, pattern: "/?" },
            pages_seen: 1,
            parser: null,
          },
          ...ps,
        ];
      });
    },
    [toast]
  );

  const forceRun = useCallback(
    (jobId: string) => {
      if (!jobId) return;
      toast("info", "Force run triggered", `job_id: ${jobId}`);
      setParsers((ps) => ps.map((p) => (p._id === jobId ? { ...p, status: "running" } : p)));
      setTimeout(() => {
        setParsers((ps) =>
          ps.map((p) =>
            p._id === jobId ? { ...p, status: "done", completed_at: new Date().toISOString() } : p
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
