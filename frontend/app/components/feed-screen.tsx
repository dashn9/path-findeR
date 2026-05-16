"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Play } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Field } from "./ui/field";
import { Input, Textarea } from "./ui/input";
import { StatusPill } from "./ui/status-pill";
import { MOCK_CONFIG } from "../lib/mockData";
import { useStore } from "../lib/store";
import { relTime } from "../lib/utils";

export function FeedScreen() {
  const router = useRouter();
  const { feedQueue, parsers, feedPage, forceRun } = useStore();
  const [jobId, setJobId] = useState("");
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [forceOnSubmit, setForceOnSubmit] = useState(false);

  const genJobId = () => setJobId(Math.random().toString(16).slice(2, 8));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !html) return;
    const id = jobId || Math.random().toString(16).slice(2, 8);
    setJobId(id);
    feedPage({ job_id: id, url, html });
    setUrl("");
    setHtml("");
    if (forceOnSubmit) forceRun(id);
  };

  const pages = feedQueue.filter((p) => p.job_id === jobId);
  const job = parsers.find((p) => p._id === jobId);

  return (
    <div className="grid gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">POST /feed</div>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight text-ink-1">
            Feed pages
          </h1>
        </div>
        <div className="font-mono text-xs text-ink-3">min_pages = {MOCK_CONFIG.min_pages}</div>
      </header>

      <div className="grid gap-5 max-[1100px]:grid-cols-1 [@media(min-width:1100px)]:grid-cols-2">
        <section className="grid gap-3.5 border border-rule p-[18px]">
          <form onSubmit={handleSubmit} className="grid gap-3.5">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field
                label="job_id"
                hint={
                  <>
                    Reuse an existing id, or{" "}
                    <button
                      type="button"
                      className="bg-transparent p-0 text-accent underline underline-offset-2"
                      onClick={genJobId}
                    >
                      generate one
                    </button>
                    .
                  </>
                }
              >
                <Input mono value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="a3f9c1" />
              </Field>
              <Field label="url">
                <Input
                  mono
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://shop.example.com/products/87423"
                />
              </Field>
            </div>
            <Field label="html" hint="Raw HTML up to max_direct_kb (300kb). Larger payloads are streamed.">
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

        <section className="grid gap-3.5 border border-rule p-[18px]">
          <header className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              Queue · job_id {jobId || "—"}
            </span>
            {job && <StatusPill status={job.status} stage={job.stage} failStage={job.fail_stage} compact />}
          </header>

          {pages.length === 0 ? (
            <div className="border border-dashed border-rule-strong bg-paper-surface px-4 py-6 text-center">
              <div className="font-mono text-ink-3">no pages yet</div>
              <div className="text-xs text-ink-2">
                Feed at least {MOCK_CONFIG.min_pages} pages to start a job.
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
              {pages.length}/{MOCK_CONFIG.min_pages} pages ·{" "}
              {pages.length >= MOCK_CONFIG.min_pages ? "ready to run" : "minimum not reached"}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" disabled={!jobId} onClick={() => forceRun(jobId)} icon={<Play />}>
                Force run
              </Button>
              {job && job.status === "done" && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<ArrowRight />}
                  onClick={() => router.push(`/parser/${jobId}`)}
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
        <div className="mt-2 flex flex-wrap items-center gap-2.5 border border-rule bg-paper-surface px-[18px] py-3.5 font-mono text-xs text-ink-1">
          <span>URL pattern</span>
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
