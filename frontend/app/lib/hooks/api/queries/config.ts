"use client";

import { useQuery } from "@tanstack/react-query";
import { request } from "../../../client";
import { useStore } from "../../../store";
import type { ConfigView } from "../../../types";

export const configQueryKey = () => ["config"] as const;

// Service config rarely changes mid-session (env vars are read at startup),
// so a generous staleTime is fine. Settings panel and Feed screen both pull
// from this — single source of truth.
export const useConfigQuery = () => {
  const { baseUrl } = useStore();
  return useQuery({
    queryKey: configQueryKey(),
    queryFn: () => request<ConfigView>(baseUrl, "config"),
    staleTime: 60_000,
  });
};
