"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { useStore } from "../lib/store";

export function SettingsScreen() {
  const { baseUrl, setBaseUrl, config } = useStore();
  const [draft, setDraft] = useState(baseUrl);
  const [dirty, setDirty] = useState(false);

  return (
    <div className="grid gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">Configuration</div>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight text-ink-1">Settings</h1>
        </div>
      </header>

      <section className="grid gap-3.5 border border-rule p-5">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">Runtime · client</div>
        <Field
          label="PATH_FINDER_URL"
          hint="Base URL the frontend hits. Build-time default is set with the PATH_FINDER_URL env var."
        >
          <div className="flex items-stretch gap-1.5">
            <Input
              mono
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(true);
              }}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty}
              onClick={() => {
                setBaseUrl(draft);
                setDirty(false);
              }}
            >
              Save
            </Button>
          </div>
        </Field>
      </section>

      <section className="grid gap-3.5 border border-rule p-5">
        <header className="flex items-center justify-between">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
            Service · pipeline (read-only)
          </div>
          <span className="font-mono text-ink-3">GET /config</span>
        </header>
        <dl className="m-0 grid">
          <Row k="ai_endpoint" v={config.ai_endpoint} />
          <Row k="ai_model" v={config.ai_model} />
          <Row k="max_direct_kb" v={config.max_direct_kb} unit="kb" />
          <Row k="top_n_nodes" v={config.top_n_nodes} />
          <Row k="max_sentences" v={config.max_sentences} />
          <Row k="max_sentence_chars" v={config.max_sentence_chars} />
          <Row k="similarity_threshold" v={config.similarity_threshold} />
          <Row k="max_retries" v={config.max_retries} />
          <Row k="output_format" v={config.output_format} />
          <Row k="min_pages" v={config.min_pages} />
          <Row k="exclusions" v={config.exclusions} array />
        </dl>
      </section>
    </div>
  );
}

function Row({ k, v, unit, array }: { k: string; v: string | number | string[]; unit?: string; array?: boolean }) {
  let body: ReactNode;
  if (array) {
    const arr = v as string[];
    body = arr.length ? (
      <div className="flex flex-wrap gap-1">
        {arr.map((s) => (
          <Badge key={s} tone="neutral">
            {s}
          </Badge>
        ))}
      </div>
    ) : (
      <span className="text-ink-3">—</span>
    );
  } else {
    body = (
      <>
        <span className="text-ink-1">{String(v)}</span>
        {unit && <span className="text-ink-3"> {unit}</span>}
      </>
    );
  }
  return (
    <div className="grid grid-cols-[220px_1fr] gap-4 border-b border-rule py-2 text-[13px] last:border-b-0">
      <dt className="font-mono text-ink-2">{k}</dt>
      <dd className="m-0 font-mono">{body}</dd>
    </div>
  );
}
