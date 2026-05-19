"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { useParserFeedsQuery } from "../../lib/hooks/api/queries/parsers";
import { fmtTime } from "../../lib/utils";
import { cn } from "../../lib/utils";
import type { ParserDoc } from "../../lib/types";

// FeedsTab is the routing audit trail: every time a page joined this
// parser (or was the trigger that created it), we record what we saw and
// who else we considered. Each row expands to show the full candidate
// scoreboard so the user can see why this parser won.
export function FeedsTab({ parser }: { parser: ParserDoc }) {
  const { data: feeds, isLoading, isFetching, refetch } = useParserFeedsQuery(parser._id);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
          GET /parser/{parser._id}/feeds
        </div>
        <Button
          size="sm"
          icon={<RefreshCw className={isFetching ? "animate-spin" : undefined} />}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {isLoading ? (
        <EmptyState title="Loading feed log…" body={`parser_id ${parser._id}`} />
      ) : !feeds || feeds.length === 0 ? (
        <EmptyState
          title="No routing decisions yet"
          body="Each fed page records its decision here: candidate scores, threshold, and outcome."
        />
      ) : (
        <div className="grid">
          <div className="grid grid-cols-[14px_70px_minmax(0,1fr)_60px_70px_70px_90px] items-center gap-3 border border-rule bg-paper-surface px-3.5 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
            <div />
            <div>outcome</div>
            <div>url</div>
            <div className="text-right">page #</div>
            <div className="text-right">paths</div>
            <div className="text-right">marks</div>
            <div className="text-right">when</div>
          </div>
          {feeds.map((d) => {
            const open = expanded.has(d._id);
            return (
              <div key={d._id} className="border-x border-b border-rule bg-paper-elevated last:border-b">
                <button
                  type="button"
                  onClick={() => toggle(d._id)}
                  className="grid w-full cursor-pointer grid-cols-[14px_70px_minmax(0,1fr)_60px_70px_70px_90px] items-center gap-3 px-3.5 py-2.5 text-left text-xs hover:bg-paper-sunken"
                >
                  {open ? (
                    <ChevronDown size={14} className="text-ink-3" />
                  ) : (
                    <ChevronRight size={14} className="text-ink-3" />
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center justify-center border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                      d.outcome === "created"
                        ? "border-accent text-accent"
                        : "border-rule text-ink-2",
                    )}
                  >
                    {d.outcome}
                  </span>
                  <span
                    className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink-1"
                    title={d.url}
                  >
                    {d.url}
                  </span>
                  <span className="text-right font-mono text-ink-2">
                    {String(d.page_index).padStart(3, "0")}
                  </span>
                  <span
                    className="text-right font-mono text-ink-2"
                    title="Distinct root-to-node tag paths seen in this page"
                  >
                    {d.shape.path_count}
                  </span>
                  <span
                    className="text-right font-mono text-ink-2"
                    title="Stable identifiers (#id, role=, aria-*=, stable classes) seen in this page"
                  >
                    {d.shape.mark_count}
                  </span>
                  <span className="text-right font-mono text-ink-3">{fmtTime(d.at)}</span>
                </button>

                {open && (
                  <div className="grid gap-3 border-t border-rule bg-paper-surface px-4 py-3.5">
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 font-mono text-xs">
                      <span className="text-ink-3">hostname</span>
                      <span className="text-ink-1">{d.hostname}</span>
                      <span className="text-ink-3">tokens</span>
                      <span className="text-ink-1">
                        {d.tokens?.length ? "/" + d.tokens.join("/") : "—"}
                      </span>
                      <span className="text-ink-3">threshold</span>
                      <span className="text-ink-1">{d.threshold.toFixed(2)}</span>
                    </div>

                    <div className="grid">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                        Candidates considered ({d.candidates?.length ?? 0})
                      </div>
                      {!d.candidates || d.candidates.length === 0 ? (
                        <div className="mt-1.5 font-mono text-xs text-ink-2">
                          No existing parsers on this hostname — created fresh.
                        </div>
                      ) : (
                        <div className="mt-1.5 grid border border-rule">
                          <div className="grid grid-cols-[minmax(0,1fr)_70px_90px_70px_90px] items-center gap-3 border-b border-rule bg-paper px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-3">
                            <div>parser_id</div>
                            <div className="text-right">score</div>
                            <div className="text-right">state</div>
                            <div className="text-right">pages</div>
                            <div className="text-right">verdict</div>
                          </div>
                          {d.candidates.map((c) => (
                            <div
                              key={c.parser_id}
                              className={cn(
                                "grid grid-cols-[minmax(0,1fr)_70px_90px_70px_90px] items-center gap-3 border-b border-rule px-3 py-1.5 font-mono text-xs last:border-b-0",
                                c.accepted ? "bg-paper-elevated" : "bg-paper-surface",
                              )}
                            >
                              <div
                                className="overflow-hidden text-ellipsis whitespace-nowrap text-ink-1"
                                title={c.parser_id}
                              >
                                {c.parser_id}
                              </div>
                              <div
                                className={cn(
                                  "text-right",
                                  c.score >= d.threshold ? "text-success" : "text-ink-2",
                                )}
                              >
                                {c.score.toFixed(3)}
                              </div>
                              <div className="text-right text-ink-2">{c.state || "—"}</div>
                              <div className="text-right text-ink-2">{c.page_count}</div>
                              <div className="text-right">
                                {c.accepted ? (
                                  <span className="text-success">accepted</span>
                                ) : c.score >= d.threshold ? (
                                  <span className="text-ink-3">below-best</span>
                                ) : (
                                  <span className="text-ink-3">below-thr</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
