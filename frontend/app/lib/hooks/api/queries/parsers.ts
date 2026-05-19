"use client";

import { useQuery } from "@tanstack/react-query";
import { request } from "../../../client";
import { useStore } from "../../../store";
import type { CorpusPage, FeedDecision, ParserDoc } from "../../../types";

// Query keys are tuples ['parsers'] / ['parser', id] / etc. so mutations
// can invalidate them surgically.

export const parsersQueryKey = () => ["parsers"] as const;
export const parserQueryKey = (id: string) => ["parser", id] as const;
export const parserCorpusQueryKey = (id: string) => ["parser", id, "corpus"] as const;
export const parserFeedsQueryKey = (id: string) => ["parser", id, "feeds"] as const;

export const useParsersQuery = () => {
  const { baseUrl } = useStore();
  return useQuery({
    queryKey: parsersQueryKey(),
    queryFn: () => request<ParserDoc[]>(baseUrl, "parsers"),
  });
};

// Polls every 1.5s while a run is in flight so the progress bar + run log
// update live, then drops back to the default staleTime once status flips
// to done/failed.
export const useParserQuery = (id: string) => {
  const { baseUrl } = useStore();
  return useQuery({
    queryKey: parserQueryKey(id),
    queryFn: () => request<ParserDoc>(baseUrl, "parser", { pathParams: { id } }),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1500 : false),
  });
};

export const useParserCorpusQuery = (id: string) => {
  const { baseUrl } = useStore();
  return useQuery({
    queryKey: parserCorpusQueryKey(id),
    queryFn: () => request<CorpusPage[]>(baseUrl, "parserCorpus", { pathParams: { id } }),
    enabled: !!id,
  });
};

export const useParserFeedsQuery = (id: string) => {
  const { baseUrl } = useStore();
  return useQuery({
    queryKey: parserFeedsQueryKey(id),
    queryFn: () => request<FeedDecision[]>(baseUrl, "parserFeeds", { pathParams: { id } }),
    enabled: !!id,
  });
};
