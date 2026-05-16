"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { JsonBlock } from "./ui/json-block";
import { StatusPill } from "./ui/status-pill";
import { Tabs } from "./ui/tabs";
import { RunInspector } from "./inspector/run-inspector";
import { LabelGroup } from "./manifest/label-group";
import { SelectorTester } from "./manifest/selector-tester";
import { RegenerateModal } from "./manifest/regenerate-modal";
import { useStore } from "../lib/store";
import { fmtTime } from "../lib/utils";
import type { ParserDoc } from "../lib/types";

type TabId = "tree" | "inspect" | "test" | "raw";

export function ManifestScreen({ parser }: { parser: ParserDoc }) {
  const { regenerate } = useStore();
  const [tab, setTab] = useState<TabId>("inspect");
  const [regenOpen, setRegenOpen] = useState(false);

  const labelEntries = parser.parser ? Object.entries(parser.parser) : [];
  const unresolvedCount = labelEntries.filter(([, v]) => v.unresolved).length;

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
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-y-1.5 border border-rule bg-paper-surface px-3.5 py-2.5 font-mono text-xs text-ink-2">
        <span>
          <StatusPill status={parser.status} stage={parser.stage} failStage={parser.fail_stage} />
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

      <Tabs<TabId>
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "tree", label: "Manifest", badge: labelEntries.length },
          {
            id: "inspect",
            label: "Inspector",
            badge: unresolvedCount > 0 ? unresolvedCount + "!" : null,
          },
          { id: "test", label: "Test selectors" },
          { id: "raw", label: "Raw JSON" },
        ]}
      />

      <div className="pt-2">
        {tab === "tree" && <ManifestTree parser={parser} />}
        {tab === "inspect" && <RunInspector parser={parser} />}
        {tab === "raw" && <JsonBlock data={parser} filename={`parser-${parser._id}.json`} />}
        {tab === "test" && <SelectorTester parser={parser} />}
      </div>

      <RegenerateModal
        open={regenOpen}
        parser={parser}
        onClose={() => setRegenOpen(false)}
        onConfirm={(opts) => {
          setRegenOpen(false);
          regenerate(parser._id, opts);
        }}
      />
    </div>
  );
}

function Sep() {
  return <span className="px-1 text-ink-3">·</span>;
}

function ManifestTree({ parser }: { parser: ParserDoc }) {
  if (!parser.parser) {
    return <EmptyState title="Manifest not ready" body="Pipeline is still running." />;
  }
  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between border-b border-rule pb-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">URL pattern</div>
          <div className="mt-1 font-mono text-[15px]">
            <span className="text-ink-1">{parser.url_pattern.host}</span>
            <span className="text-ink-3">{parser.url_pattern.pattern}</span>
          </div>
        </div>
        <div className="font-mono text-[11px] text-ink-3">{parser.pages_seen || 0} pages in corpus</div>
      </div>

      <div className="grid gap-4">
        {Object.entries(parser.parser).map(([label, def]) => (
          <LabelGroup key={label} name={label} def={def} />
        ))}
      </div>
    </div>
  );
}
