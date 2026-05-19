"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { useParserCorpusQuery } from "../../lib/hooks/api/queries/parsers";
import { fmtTime } from "../../lib/utils";
import type { ParserDoc } from "../../lib/types";

// CorpusTab shows the parser's accumulated pages — URL, fetch time, index.
// The "oversight" view: prove the system actually accepted what was fed.
export function CorpusTab({ parser }: { parser: ParserDoc }) {
  const { data: pages, isLoading, isFetching, refetch } = useParserCorpusQuery(parser._id);
  const pattern = parser.url_tokens?.length ? "/" + parser.url_tokens.join("/") : "—";

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 border border-rule bg-paper-surface px-4 py-3 font-mono text-xs">
        <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
          <span className="text-ink-3">hostname</span>
          <span className="text-ink-1">{parser.hostname}</span>
          <span className="text-ink-3">pattern</span>
          <span className="text-ink-1">{pattern}</span>
          <span className="text-ink-3">state</span>
          <span className={parser.state === "forming" ? "text-warning" : "text-ink-1"}>{parser.state ?? "—"}</span>
          <span className="text-ink-3">pages</span>
          <span className="text-ink-1">{parser.page_count}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
          GET /parser/{parser._id}/corpus
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
        <EmptyState title="Loading corpus…" body={`parser_id ${parser._id}`} />
      ) : !pages || pages.length === 0 ? (
        <EmptyState
          title="No pages yet"
          body="Once pages are fed to this parser they'll appear here."
        />
      ) : (
        <div className="grid border border-rule bg-paper-elevated">
          <div className="grid grid-cols-[60px_minmax(0,1fr)_140px] items-center gap-3 border-b border-rule bg-paper-surface px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-3">
            <div className="text-right">#</div>
            <div>url</div>
            <div className="text-right">fetched</div>
          </div>
          {pages.map((p) => (
            <div
              key={p.index}
              className="grid grid-cols-[60px_minmax(0,1fr)_140px] items-center gap-3 border-b border-rule bg-paper-elevated px-4 py-2 text-xs last:border-b-0"
            >
              <div className="text-right font-mono text-ink-3">
                {String(p.index).padStart(3, "0")}
              </div>
              <div
                className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink-1"
                title={p.url}
              >
                {p.url}
              </div>
              <div className="text-right font-mono text-ink-2">{fmtTime(p.fetched_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
