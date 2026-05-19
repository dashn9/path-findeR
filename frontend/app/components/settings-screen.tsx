"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { useStore } from "../lib/store";
import { useConfigQuery } from "../lib/hooks/api/queries/config";

export function SettingsScreen() {
  const { baseUrl, setBaseUrl, toast } = useStore();
  const cfg = useConfigQuery();
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
          hint="Base URL the frontend hits. Build-time default is set with the NEXT_PUBLIC_PATH_FINDER_URL env var."
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
                toast("success", "Endpoint updated", draft);
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
            Service · loaded config (read-only)
          </div>
          <span className="font-mono text-ink-3">GET /config</span>
        </header>
        {cfg.isLoading ? (
          <div className="font-mono text-xs text-ink-3">loading…</div>
        ) : cfg.isError ? (
          <div className="font-mono text-xs text-danger">
            Couldn't reach {baseUrl}/config — {cfg.error instanceof Error ? cfg.error.message : "unknown error"}
          </div>
        ) : cfg.data ? (
          <>
            <Group label="AI">
              <Row k="adapter" v={cfg.data.ai.adapter} />
              <Row k="model" v={cfg.data.ai.model} />
              <Row k="base_url" v={cfg.data.ai.base_url} />
              <Row
                k="api_key"
                v={cfg.data.ai.has_key ? "(set)" : "(empty — pipeline will fail)"}
              />
            </Group>
            <Group label="Pipeline">
              <Row k="min_pages" v={cfg.data.pipeline.min_pages} />
              <Row k="max_direct_kb" v={cfg.data.pipeline.max_direct_kb} unit="kb" />
              <Row k="top_n_nodes" v={cfg.data.pipeline.top_n_nodes} />
              <Row k="max_sentences" v={cfg.data.pipeline.max_sentences} />
              <Row k="max_sentence_chars" v={cfg.data.pipeline.max_sentence_chars} />
              <Row k="similarity_threshold" v={cfg.data.pipeline.similarity_threshold} />
              <Row
                k="shape_similarity_threshold"
                v={cfg.data.pipeline.shape_similarity_threshold}
              />
              <Row k="max_retries" v={cfg.data.pipeline.max_retries} />
              <Row k="output_format" v={cfg.data.pipeline.output_format} />
              <Row
                k="rerun_cooldown_seconds"
                v={cfg.data.pipeline.rerun_cooldown_seconds}
                unit="s"
              />
              <Row k="exclusions" v={cfg.data.pipeline.exclusions} array />
            </Group>
            <Group label="Storage">
              <Row k="adapter" v={cfg.data.storage.adapter} />
              <Row k="progress_dir" v={cfg.data.storage.progress_dir} />
            </Group>
          </>
        ) : null}
      </section>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="border-b border-rule pb-1 font-mono text-[10px] uppercase tracking-wider text-ink-3">
        {label}
      </div>
      <dl className="m-0 grid">{children}</dl>
    </div>
  );
}

function Row({
  k,
  v,
  unit,
  array,
}: {
  k: string;
  v: string | number | string[];
  unit?: string;
  array?: boolean;
}) {
  let body: ReactNode;
  if (array) {
    const arr = v as string[];
    body = arr && arr.length ? (
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
