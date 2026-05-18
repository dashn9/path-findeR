"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { StatusPill } from "./ui/status-pill";
import { useStore } from "../lib/store";
import { relTime, cn } from "../lib/utils";

export function HistoryScreen() {
  const router = useRouter();
  const { parsers } = useStore();

  return (
    <div className="grid gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">Recent parsers</div>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight text-ink-1">History</h1>
        </div>
        <div className="font-mono text-ink-3">{parsers.length} parsers</div>
      </header>

      <div className="grid border border-rule bg-paper-elevated">
        <div className="grid grid-cols-[120px_100px_minmax(0,1.4fr)_minmax(0,1.6fr)_70px_90px_90px_20px] items-center gap-3 border-b border-rule bg-paper-surface px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-3">
          <div>status</div>
          <div>template</div>
          <div>host</div>
          <div>pattern</div>
          <div className="text-right">labels</div>
          <div className="text-right">unresolved</div>
          <div className="text-right">created</div>
          <div />
        </div>
        {parsers.map((p) => {
          const labelCount = p.parser ? Object.keys(p.parser).length : 0;
          const unresolved = p.parser ? Object.values(p.parser).filter((v) => v.unresolved).length : 0;
          // _id is "<host>:<shape-id>". The host has its own column; the
          // suffix discriminates templates within that host.
          const templateID = p._id.split(":").pop() ?? p._id;
          return (
            <button
              key={p._id}
              onClick={() => router.push(`/parser/${encodeURIComponent(p._id)}`)}
              title={p._id}
              className="grid cursor-pointer grid-cols-[120px_100px_minmax(0,1.4fr)_minmax(0,1.6fr)_70px_90px_90px_20px] items-center gap-3 border-b border-rule bg-paper-elevated px-4 py-2.5 text-left text-xs transition-colors last:border-b-0 hover:bg-paper-sunken"
            >
              <div className="min-w-0">
                <StatusPill status={p.status} stage={p.stage} failStage={p.fail_stage} compact />
              </div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink-1">
                {templateID}
              </div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink-1">
                {p.url_pattern?.host ?? p.hostname}
              </div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink-2">
                {p.url_pattern?.pattern}
              </div>
              <div className="text-right font-mono">{labelCount || "—"}</div>
              <div className={cn("text-right font-mono", unresolved > 0 ? "text-warning" : "text-ink-3")}>
                {unresolved || "0"}
              </div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-right font-mono text-ink-2">
                {relTime(p.created_at)}
              </div>
              <div className="text-right">
                <ChevronRight size={14} className="text-ink-3" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
