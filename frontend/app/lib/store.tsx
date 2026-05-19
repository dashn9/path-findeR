"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { PATH_FINDER_URL_DEFAULT } from "./mockData";
import { ApiError } from "./client";
import type { FeedQueueItem, ToastItem, ToastKind } from "./types";

// Store owns *client-only* state now: toast queue, feed queue, base URL.
// Server state (parsers, corpus, feeds, config, health) lives in react-query
// — see lib/hooks/api/queries/* and mutations/*.

interface StoreValue {
  feedQueue: FeedQueueItem[];
  pushFeedQueueItem: (item: FeedQueueItem) => void;
  baseUrl: string;
  setBaseUrl: (s: string) => void;
  toasts: ToastItem[];
  dismissToast: (id: number) => void;
  toast: (kind: ToastKind, title: string, body?: string) => void;
  toastApiError: (verb: string, err: unknown) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [feedQueue, setFeedQueue] = useState<FeedQueueItem[]>([]);
  const [baseUrl, setBaseUrl] = useState(
    process.env.NEXT_PUBLIC_PATH_FINDER_URL || PATH_FINDER_URL_DEFAULT,
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, kind, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const toastApiError = useCallback(
    (verb: string, err: unknown) => {
      if (err instanceof ApiError) {
        toast("error", `${verb} failed`, `${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        toast("error", `${verb} failed`, err.message);
      } else {
        toast("error", `${verb} failed`);
      }
    },
    [toast],
  );

  const pushFeedQueueItem = useCallback((item: FeedQueueItem) => {
    setFeedQueue((q) => [...q, item]);
  }, []);

  return (
    <StoreContext.Provider
      value={{
        feedQueue,
        pushFeedQueueItem,
        baseUrl,
        setBaseUrl,
        toasts,
        dismissToast,
        toast,
        toastApiError,
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
