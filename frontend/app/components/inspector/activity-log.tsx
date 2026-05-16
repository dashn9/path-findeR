"use client";

import { useState } from "react";
import type { ActivityEvent } from "../../lib/types";
import { cn } from "../../lib/utils";

function toneOf(kind: string) {
  if (kind.startsWith("validate/miss")) return "text-warning";
  if (kind === "done") return "text-success";
  if (kind.startsWith("validate/match")) return "text-success";
  if (kind.startsWith("emit")) return "font-medium text-accent";
  return "text-ink-1";
}

export function ActivityLog({ rows }: { rows: ActivityEvent[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(-8);

  return (
    <section className="grid gap-3 border border-rule bg-paper-surface p-4 pt-3.5">
      <header className="flex items-center justify-between border-b border-rule pb-2.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">Activity log</span>
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="bg-transparent p-0 font-mono text-xs text-accent underline underline-offset-2"
        >
          {showAll ? `collapse · ${rows.length}` : `show all · ${rows.length}`}
        </button>
      </header>
      <div className="max-h-80 overflow-auto border border-rule bg-paper-elevated py-1.5">
        {visible.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[110px_170px_1fr] gap-3.5 px-3.5 py-1 font-mono text-[11.5px] leading-relaxed hover:bg-paper-sunken"
          >
            <span className="text-ink-3">{r.t}</span>
            <span className={cn(toneOf(r.kind))}>{r.kind}</span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-ink-2">{r.payload}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
