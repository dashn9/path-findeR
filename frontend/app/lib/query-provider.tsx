"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// Single QueryClient per browser tab. We construct it lazily inside useState
// so React strict-mode's double-render doesn't double-init, and so server-side
// renders never share a client across requests.
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Server state for this app is small and mutates often (feeds,
            // pipeline runs). A short stale time means the UI catches up
            // quickly without us writing explicit invalidations everywhere.
            staleTime: 5_000,
            // 404s mean "doesn't exist" — retrying is wasted work. Let other
            // errors retry once (transient network blips).
            retry: (failureCount, err) => {
              const status = (err as { status?: number }).status;
              if (status === 404) return false;
              return failureCount < 1;
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
