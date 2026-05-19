"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../../../client";
import { useStore } from "../../../store";
import { parserQueryKey, parsersQueryKey } from "../queries/parsers";

interface FeedResponse {
  status: string;
  parser_id?: string;
  error?: string;
}

interface FeedVars {
  url: string;
  html: string;
}

// useFeedMutation pushes one (url, html) to the service. On success it
// invalidates the parsers list + the specific parser so the UI catches up
// without manual refetches. Components handle their own toast UX via the
// returned object's onSuccess/onError callback args.
export const useFeedMutation = () => {
  const { baseUrl } = useStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: FeedVars) =>
      request<FeedResponse>(baseUrl, "feed", { body: vars }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: parsersQueryKey() });
      if (data.parser_id) {
        qc.invalidateQueries({ queryKey: parserQueryKey(data.parser_id) });
      }
    },
  });
};

export const useForceRunMutation = () => {
  const { baseUrl } = useStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (parserId: string) =>
      request(baseUrl, "force", { body: { parser_id: parserId } }),
    onSuccess: (_data, parserId) => {
      qc.invalidateQueries({ queryKey: parserQueryKey(parserId) });
      qc.invalidateQueries({ queryKey: parsersQueryKey() });
    },
  });
};

interface RegenerateVars {
  parserId: string;
  labels: string[];
  force: boolean;
}

// useNukeParserMutation wipes a parser end-to-end (manifest doc, corpus,
// feed log, run history, progress file). Only invalidates the parsers list
// here — *not* the per-parser cache. Clearing the per-parser query on
// success races the calling page's own useParserQuery, which immediately
// refetches the just-deleted id and 404s. The page's onSuccess handler
// navigates away; the stale cache entry GCs on its own.
export const useNukeParserMutation = () => {
  const { baseUrl } = useStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (parserId: string) =>
      request<{ status: string; parser_id: string }>(baseUrl, "nukeParser", {
        pathParams: { id: parserId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: parsersQueryKey() });
    },
  });
};

export const useRegenerateMutation = () => {
  const { baseUrl } = useStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ parserId, labels, force }: RegenerateVars) =>
      request(baseUrl, "regenerate", {
        body: { parser_id: parserId, labels, force },
      }),
    onSuccess: (_data, { parserId }) => {
      qc.invalidateQueries({ queryKey: parserQueryKey(parserId) });
      qc.invalidateQueries({ queryKey: parsersQueryKey() });
    },
  });
};
