"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { StatusPill } from "./ui/status-pill";
import { useParsersQuery } from "../lib/hooks/api/queries/parsers";
import { relTime, cn } from "../lib/utils";

export function HistoryScreen() {
  const router = useRouter();
  const { data: parsers = [], isFetching, refetch } = useParsersQuery();

  return (
    <div className="grid gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">GET /parsers</div>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight text-ink-1">Parsers</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="font-mono text-ink-3">{parsers.length} active</div>
          <Button
            size="sm"
            icon={<RefreshCw className={isFetching ? "animate-spin" : undefined} />}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </header>

      {parsers.length === 0 ? (
        <EmptyState
          title="No parsers yet"
          body="Feed some pages to spin up the first parser. The system groups pages by hostname + URL pattern + page structure as they arrive."
          cta={
            <Button variant="primary" onClick={() => router.push("/feed")}>
              Go to Feed
            </Button>
          }
        />
      ) : (
        <div className="grid border border-rule bg-paper-elevated">
          <div className="grid grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1.6fr)_70px_60px_70px_90px_20px] items-center gap-3 border-b border-rule bg-paper-surface px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-3">
            <div>status</div>
            <div>host</div>
            <div>pattern</div>
            <div className="text-right">labels</div>
            <div className="text-right">pages</div>
            <div className="text-right">state</div>
            <div className="text-right">created</div>
            <div />
          </div>
          {parsers.map((p) => {
            const labelCount = p.parser ? Object.keys(p.parser).length : 0;
            const tokenPattern = p.url_tokens?.length
              ? "/" + p.url_tokens.join("/")
              : p.url_pattern?.pattern ?? "—";
            return (
              <button
                key={p._id}
                onClick={() => router.push(`/parser/${encodeURIComponent(p._id)}`)}
                title={p._id}
                className="grid cursor-pointer grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1.6fr)_70px_60px_70px_90px_20px] items-center gap-3 border-b border-rule bg-paper-elevated px-4 py-2.5 text-left text-xs transition-colors last:border-b-0 hover:bg-paper-sunken"
              >
                <div className="min-w-0">
                  <StatusPill status={p.status} compact />
                </div>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink-1">
                  {p.hostname ?? p.url_pattern?.host}
                </div>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink-2">
                  {tokenPattern}
                </div>
                <div className="text-right font-mono">{labelCount || "—"}</div>
                <div className="text-right font-mono text-ink-2">{p.page_count}</div>
                <div className={cn("text-right font-mono", p.state === "forming" ? "text-warning" : "text-ink-2")}>
                  {p.state ?? "—"}
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
      )}
    </div>
  );
}
