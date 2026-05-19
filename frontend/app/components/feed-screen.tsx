"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Play } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Field } from "./ui/field";
import { Input, Textarea } from "./ui/input";
import { StatusPill } from "./ui/status-pill";
import { useStore } from "../lib/store";
import {
  useFeedMutation,
  useForceRunMutation,
} from "../lib/hooks/api/mutations/parsers";
import { useParsersQuery } from "../lib/hooks/api/queries/parsers";
import { useConfigQuery } from "../lib/hooks/api/queries/config";
import { relTime } from "../lib/utils";

// Conservative fallbacks for the brief moment between mount and the first
// /config response. Match the backend defaults so the UI doesn't lie even
// while the real values are in flight.
const PIPELINE_FALLBACK = { min_pages: 2, max_direct_kb: 300 };

export function FeedScreen() {
  const router = useRouter();
  const { feedQueue, pushFeedQueueItem, toast, toastApiError } = useStore();
  const { data: parsers = [] } = useParsersQuery();
  const { data: cfg } = useConfigQuery();
  const minPages = cfg?.pipeline.min_pages ?? PIPELINE_FALLBACK.min_pages;
  const maxKb = cfg?.pipeline.max_direct_kb ?? PIPELINE_FALLBACK.max_direct_kb;
  const feedPage = useFeedMutation();
  const forceRun = useForceRunMutation();
  const [parserId, setParserId] = useState("");
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [forceOnSubmit, setForceOnSubmit] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !html) {
      const missing = !url && !html ? "url and html" : !url ? "url" : "html";
      toast("error", "Missing required field", `${missing} required to feed a page`);
      return;
    }
    // Tolerate scheme-less input ("amazon.com/...") by defaulting to https.
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      new URL(normalized);
    } catch {
      toast("error", "Invalid URL", `${url} is not a valid URL`);
      return;
    }
    feedPage.mutate(
      { url: normalized, html },
      {
        onSuccess: (resp) => {
          const assignedID = resp.parser_id ?? "";
          pushFeedQueueItem({
            parser_id: assignedID,
            url: normalized,
            html,
            at: new Date().toISOString(),
          });
          toast(
            "success",
            "Page accepted",
            assignedID ? `parser_id: ${assignedID}` : undefined,
          );
          setParserId(assignedID);
          setUrl("");
          setHtml("");
          if (forceOnSubmit && assignedID) {
            forceRun.mutate(assignedID, {
              onSuccess: () =>
                toast("info", "Force run triggered", `parser_id: ${assignedID}`),
              onError: (err) => toastApiError("Force run", err),
            });
          }
        },
        onError: (err) => toastApiError("Feed", err),
      },
    );
  };

  const pages = feedQueue.filter((p) => p.parser_id === parserId);
  const parser = parsers.find((p) => p._id === parserId);

  // Byte size (UTF-8) of the pasted HTML — the wire-side limit is in kb,
  // not chars, so non-ASCII payloads measure honestly.
  const htmlBytes = useMemo(() => (html ? new Blob([html]).size : 0), [html]);
  const htmlKb = htmlBytes / 1024;
  const overLimit = htmlKb > maxKb;
  const nearLimit = !overLimit && htmlKb > maxKb * 0.85;

  return (
    <div className="grid gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">POST /feed</div>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight text-ink-1">
            Feed pages
          </h1>
        </div>
        <div className="font-mono text-xs text-ink-3">min_pages = {minPages}</div>
      </header>

      <div className="grid gap-5 max-[1100px]:grid-cols-1 [@media(min-width:1100px)]:grid-cols-2">
        <section className="grid gap-3.5 border border-rule p-4.5">
          <form onSubmit={handleSubmit} className="grid gap-3.5">
            <Field
              label="url"
              hint="Server derives the bucket from the URL's hostname + path tokens + page shape."
            >
              <Input
                mono
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://shop.example.com/products/87423"
              />
            </Field>
            <Field
              label={
                <span className="flex items-baseline justify-between gap-3">
                  <span>html</span>
                  <span
                    className={
                      overLimit
                        ? "text-danger"
                        : nearLimit
                          ? "text-warning"
                          : "text-ink-3"
                    }
                  >
                    {htmlKb.toFixed(htmlKb < 10 ? 2 : 1)}kb / {maxKb}kb
                  </span>
                </span>
              }
              hint="Raw HTML up to max_direct_kb. Larger payloads are streamed."
            >
              <Textarea
                mono
                rows={9}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder={"<!DOCTYPE html>\n<html>...</html>"}
              />
            </Field>
            <div className="flex items-center gap-3 border-t border-rule pt-3.5">
              <Checkbox
                checked={forceOnSubmit}
                onChange={(e) => setForceOnSubmit(e.target.checked)}
                label="Force run if minimum reached"
              />
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setUrl("");
                    setHtml("");
                  }}
                >
                  Discard
                </Button>
                <Button variant="primary" type="submit" icon={<ArrowRight />}>
                  Feed page
                </Button>
              </div>
            </div>
          </form>
        </section>

        <section className="grid gap-3.5 border border-rule p-4.5">
          <header className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              Queue · parser_id {parserId || "—"}
            </span>
            {parser && <StatusPill status={parser.status} compact />}
          </header>

          {pages.length === 0 ? (
            <div className="border border-dashed border-rule-strong bg-paper-surface px-4 py-6 text-center">
              <div className="font-mono text-ink-3">no pages yet</div>
              <div className="text-xs text-ink-2">
                Feed at least {minPages} pages to start a run.
              </div>
            </div>
          ) : (
            <ol className="m-0 grid list-none gap-1.5 p-0">
              {pages.map((p, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border border-rule bg-paper-elevated px-3 py-2"
                >
                  <span className="font-mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink-1">
                      {p.url}
                    </div>
                    <div className="font-mono text-xs text-ink-2">
                      {Math.round((p.html?.length || 0) / 1024)}kb · accepted {relTime(p.at)}
                    </div>
                  </div>
                  <Check size={14} className="text-success" />
                </li>
              ))}
            </ol>
          )}

          <footer className="flex items-center justify-between gap-3 border-t border-rule pt-3.5">
            <div className="text-xs text-ink-2">
              {pages.length}/{minPages} pages ·{" "}
              {pages.length >= minPages ? "ready to run" : "minimum not reached"}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                disabled={!parserId || forceRun.isPending}
                onClick={() =>
                  forceRun.mutate(parserId, {
                    onSuccess: () =>
                      toast("info", "Force run triggered", `parser_id: ${parserId}`),
                    onError: (err) => toastApiError("Force run", err),
                  })
                }
                icon={<Play />}
              >
                Force run
              </Button>
              {parser && parser.status === "done" && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<ArrowRight />}
                  onClick={() => router.push(`/parser/${encodeURIComponent(parserId)}`)}
                >
                  Open manifest
                </Button>
              )}
            </div>
          </footer>
        </section>
      </div>

      <section className="pt-3">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">Pipeline</div>
        <div className="mt-2 flex flex-wrap items-center gap-2.5 border border-rule bg-paper-surface px-4.5 py-3.5 font-mono text-xs text-ink-1">
          <span>shape + URL tokens</span>
          <ArrowRight size={12} className="text-ink-2" />
          <span>bucket route</span>
          <ArrowRight size={12} className="text-ink-2" />
          <span>HTML parse</span>
          <ArrowRight size={12} className="text-ink-2" />
          <span>analyze + score</span>
          <ArrowRight size={12} className="text-ink-2" />
          <span>LLM labels</span>
          <ArrowRight size={12} className="text-ink-2" />
          <span>CSS selectors</span>
          <ArrowRight size={12} className="text-ink-2" />
          <span>validate corpus</span>
        </div>
      </section>
    </div>
  );
}
