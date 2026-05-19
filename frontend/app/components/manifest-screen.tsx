"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Play, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { JsonBlock } from "./ui/json-block";
import { Modal } from "./ui/modal";
import { StatusPill } from "./ui/status-pill";
import { Tabs } from "./ui/tabs";
import { RunInspector } from "./inspector/run-inspector";
import { LabelGroup } from "./manifest/label-group";
import { SelectorTester } from "./manifest/selector-tester";
import { RegenerateModal } from "./manifest/regenerate-modal";
import { CorpusTab } from "./manifest/corpus-tab";
import { FeedsTab } from "./manifest/feeds-tab";
import { ProgressBar } from "./manifest/progress-bar";
import { RunsTab } from "./manifest/runs-tab";
import { useStore } from "../lib/store";
import {
  useForceRunMutation,
  useNukeParserMutation,
  useRegenerateMutation,
} from "../lib/hooks/api/mutations/parsers";
import { fmtTime } from "../lib/utils";
import type { ParserDoc } from "../lib/types";

type TabId = "tree" | "inspect" | "test" | "corpus" | "feeds" | "runs" | "raw";

export function ManifestScreen({ parser }: { parser: ParserDoc }) {
  const router = useRouter();
  const { toast, toastApiError } = useStore();
  const forceRun = useForceRunMutation();
  const regenerate = useRegenerateMutation();
  const nuke = useNukeParserMutation();

  const parserReady = !!parser.parser;
  const [tab, setTab] = useState<TabId>(parserReady ? "inspect" : "corpus");
  const [regenOpen, setRegenOpen] = useState(false);
  const [nukeOpen, setNukeOpen] = useState(false);

  const labelEntries = parser.parser ? Object.entries(parser.parser) : [];
  const unresolvedCount = labelEntries.filter(([, v]) => v.unresolved).length;
  const notReadyReason = "Parser hasn't generated selectors yet";

  return (
    <div className="grid gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
            GET /parser/{parser._id}
          </div>
          <div className="flex items-baseline gap-3">
            <h1 className="mt-1 font-mono text-[32px] font-semibold leading-tight tracking-tight text-ink-1">
              {parser.url_pattern?.host || "—"}
            </h1>
            <span className="font-mono text-lg text-ink-3">{parser.url_pattern?.pattern}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" icon={<RefreshCw />} onClick={() => setRegenOpen(true)}>
            Regenerate
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 />}
            onClick={() => setNukeOpen(true)}
          >
            Nuke
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-y-1.5 border border-rule bg-paper-surface px-3.5 py-2.5 font-mono text-xs text-ink-2">
        <span>
          <StatusPill status={parser.status} />
        </span>
        <Sep />
        <span>
          parser_id <span className="text-ink-1">{parser._id}</span>
        </span>
        <Sep />
        <span>{labelEntries.length} labels</span>
        {unresolvedCount > 0 && (
          <>
            <Sep />
            <span className="text-warning">{unresolvedCount} unresolved</span>
          </>
        )}
        <Sep />
        <span>created {fmtTime(parser.created_at)}</span>
        {parser.completed_at && (
          <>
            <Sep />
            <span>completed {fmtTime(parser.completed_at)}</span>
          </>
        )}
      </div>

      {parser.status === "running" && parser.progress && (
        <ProgressBar progress={parser.progress} />
      )}

      {parser.error && (
        <div className="grid gap-2 border border-danger/40 bg-danger-soft px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-danger">
              <AlertTriangle size={13} />
              Pipeline error
            </div>
            <Button
              size="sm"
              icon={<Play />}
              onClick={() =>
                forceRun.mutate(parser._id, {
                  onSuccess: () =>
                    toast("info", "Force run triggered", `parser_id: ${parser._id}`),
                  onError: (err) => toastApiError("Force run", err),
                })
              }
              disabled={forceRun.isPending}
              title="Bypass the failed-status circuit breaker and try again"
            >
              Retry
            </Button>
          </div>
          <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink-1">
            {parser.error}
          </pre>
        </div>
      )}

      <Tabs<TabId>
        active={tab}
        onChange={setTab}
        tabs={[
          {
            id: "tree",
            label: "Manifest",
            badge: labelEntries.length,
            disabled: !parserReady,
            disabledReason: notReadyReason,
          },
          {
            id: "inspect",
            label: "Inspector",
            badge: unresolvedCount > 0 ? unresolvedCount + "!" : null,
            disabled: !parserReady,
            disabledReason: notReadyReason,
          },
          {
            id: "test",
            label: "Test selectors",
            disabled: !parserReady,
            disabledReason: notReadyReason,
          },
          { id: "corpus", label: "Corpus", badge: parser.page_count },
          { id: "feeds", label: "Feed log" },
          { id: "runs", label: "Runs", badge: parser.runs?.length ?? 0 },
          { id: "raw", label: "Raw JSON" },
        ]}
      />

      <div className="min-w-0 pt-2">
        {tab === "tree" && <ManifestTree parser={parser} />}
        {tab === "inspect" && <RunInspector parser={parser} />}
        {tab === "test" && <SelectorTester parser={parser} />}
        {tab === "corpus" && <CorpusTab parser={parser} />}
        {tab === "feeds" && <FeedsTab parser={parser} />}
        {tab === "runs" && <RunsTab parser={parser} />}
        {tab === "raw" && <JsonBlock data={parser} filename={`parser-${parser._id}.json`} />}
      </div>

      <Modal
        open={nukeOpen}
        onClose={() => setNukeOpen(false)}
        title={
          <span>
            Nuke <span className="font-mono text-ink-2">parser_id {parser._id}</span>
          </span>
        }
        footer={
          <>
            <span className="font-mono text-[11px] text-ink-3">irreversible</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setNukeOpen(false)} disabled={nuke.isPending}>
                Cancel
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 />}
                disabled={nuke.isPending}
                onClick={() =>
                  nuke.mutate(parser._id, {
                    onSuccess: () => {
                      setNukeOpen(false);
                      toast("success", "Parser nuked", parser._id);
                      router.push("/parsers");
                    },
                    onError: (err) => toastApiError("Nuke", err),
                  })
                }
              >
                {nuke.isPending ? "Nuking…" : "Nuke"}
              </Button>
            </div>
          </>
        }
      >
        <p className="m-0 text-[13px] text-ink-2">
          This permanently removes the manifest, every page in the corpus
          (<span className="font-mono text-ink-1">{parser.page_count}</span>), the routing
          decision log, the run history, and any in-flight progress for this parser. It cannot
          be undone — you'd have to re-feed pages from scratch to recreate it.
        </p>
      </Modal>

      {/* Remount per open so the modal's lazy-init state picks fresh defaults. */}
      <RegenerateModal
        key={regenOpen ? `${parser._id}-open` : "closed"}
        open={regenOpen}
        parser={parser}
        onClose={() => setRegenOpen(false)}
        onConfirm={(opts) => {
          setRegenOpen(false);
          regenerate.mutate(
            { parserId: parser._id, labels: opts.labels, force: opts.force },
            {
              onSuccess: () =>
                toast(
                  "info",
                  "Regeneration triggered",
                  `parser_id: ${parser._id}${
                    opts.labels.length ? ` · ${opts.labels.length} labels` : " · all labels"
                  }${opts.force ? " · force" : ""}`,
                ),
              onError: (err) => toastApiError("Regenerate", err),
            },
          );
        }}
      />
    </div>
  );
}

function Sep() {
  return <span className="px-1 text-ink-3">·</span>;
}

function ManifestTree({ parser }: { parser: ParserDoc }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between border-b border-rule pb-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">URL pattern</div>
          <div className="mt-1 font-mono text-[15px]">
            <span className="text-ink-1">{parser.url_pattern?.host}</span>
            <span className="text-ink-3">{parser.url_pattern?.pattern}</span>
          </div>
        </div>
        <div className="font-mono text-[11px] text-ink-3">{parser.page_count || 0} pages in corpus</div>
      </div>

      <div className="grid gap-4">
        {Object.entries(parser.parser ?? {}).map(([label, def]) => (
          <LabelGroup key={label} name={label} def={def} />
        ))}
      </div>
    </div>
  );
}
