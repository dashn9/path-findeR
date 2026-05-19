"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../ui/empty-state";
import { cn, fmtTime } from "../../lib/utils";
import type { ParserDoc, RunLog, StageEvent } from "../../lib/types";

// RunsTab is the persisted audit trail of past pipeline runs for a parser.
// Each row collapses by default; expand to see the stage-by-stage timeline.

export function RunsTab({ parser }: { parser: ParserDoc }) {
  const runs = (parser.runs ?? []).slice().reverse(); // newest first
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No runs recorded"
        body="A run is logged here every time the pipeline completes or fails."
      />
    );
  }
  return (
    <div className="grid gap-2">
      {runs.map((r, i) => (
        <RunRow key={`${r.started_at}-${i}`} run={r} />
      ))}
    </div>
  );
}

function RunRow({ run }: { run: RunLog }) {
  const [open, setOpen] = useState(false);
  const duration =
    new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
  const failed = run.status === "failed";

  return (
    <div className="border border-rule bg-paper-elevated">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid w-full cursor-pointer grid-cols-[14px_80px_minmax(0,1fr)_90px_130px] items-center gap-3 px-3.5 py-2.5 text-left text-xs hover:bg-paper-sunken"
      >
        {open ? (
          <ChevronDown size={14} className="text-ink-3" />
        ) : (
          <ChevronRight size={14} className="text-ink-3" />
        )}
        <span
          className={cn(
            "inline-flex items-center justify-center border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            failed ? "border-danger text-danger" : "border-success text-success",
          )}
        >
          {run.status}
        </span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink-2">
          {failed && run.failed_stage
            ? `failed at stage ${run.failed_stage} · ${run.events.length} events`
            : `${run.events.length} stages`}
        </span>
        <span className="text-right font-mono text-ink-2">{fmtDuration(duration)}</span>
        <span className="text-right font-mono text-ink-3">{fmtTime(run.started_at)}</span>
      </button>

      {open && (
        <div className="grid gap-3 border-t border-rule bg-paper-surface px-4 py-3.5">
          {run.error && (
            <pre className="m-0 whitespace-pre-wrap break-words border border-danger/40 bg-danger-soft px-3 py-2 font-mono text-xs text-ink-1">
              {run.error}
            </pre>
          )}
          <Timeline
            events={run.events}
            startMs={new Date(run.started_at).getTime()}
            endMs={new Date(run.completed_at).getTime()}
          />
        </div>
      )}
    </div>
  );
}

function Timeline({
  events,
  startMs,
  endMs,
}: {
  events: StageEvent[];
  startMs: number;
  endMs: number;
}) {
  if (events.length === 0) {
    return <div className="font-mono text-xs text-ink-3">no stage events captured.</div>;
  }
  return (
    <div className="grid gap-1">
      {events.map((e, i) => {
        const next = events[i + 1];
        // Final event has no "next stage" to subtract from — fall back to
        // the run's completed_at so a failed stage still shows how long it
        // ran before it died.
        const stop = next ? next.at_ms : endMs;
        const dur = stop > e.at_ms ? stop - e.at_ms : 0;
        return (
          <div
            key={`${e.stage}-${e.at_ms}`}
            className="grid grid-cols-[40px_minmax(0,1fr)_70px_90px] items-baseline gap-3 font-mono text-xs"
          >
            <span className="text-ink-3">#{e.stage}</span>
            <span className="text-ink-1">{e.name}</span>
            <span className="text-right text-ink-2">{dur ? fmtDuration(dur) : "—"}</span>
            <span className="text-right text-ink-3">+{fmtDuration(e.at_ms - startMs)}</span>
          </div>
        );
      })}
    </div>
  );
}

function fmtDuration(ms: number) {
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}
