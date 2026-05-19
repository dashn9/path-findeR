"use client";

import { useQuery } from "@tanstack/react-query";
import { request } from "../../../client";
import { useStore } from "../../../store";

export const healthQueryKey = () => ["health"] as const;

// One ping every 10s — short enough that "service died" is noticed quickly,
// long enough that we're not spamming /health. retry:false here because the
// failure itself is the signal (the topbar pill goes red).
export const useHealthQuery = () => {
  const { baseUrl } = useStore();
  return useQuery({
    queryKey: healthQueryKey(),
    queryFn: () => request<{ status: string }>(baseUrl, "health", { timeoutMs: 4000 }),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    retry: false,
    staleTime: 0,
  });
};
