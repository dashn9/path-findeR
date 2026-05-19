"use client";

import { cn } from "../../lib/utils";
import type { ProgressView } from "../../lib/types";

// Segmented bar — one square per pipeline stage. Fully-filled = done,
// pulsing = in progress, outline = pending. The percent label folds the
// "X of N" arithmetic into one glanceable number.

export function ProgressBar({ progress }: { progress?: ProgressView }) {
  if (!progress || !progress.total) return null;
  const { stage, total, name } = progress;
  const percent = Math.min(100, Math.round((stage / total) * 100));

  return (
    <div className="grid gap-2 border border-rule bg-paper-surface px-3.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
        <span className="uppercase tracking-wider text-ink-3">
          stage {stage}/{total}
          <span className="ml-2 normal-case tracking-normal text-ink-1">{name}</span>
        </span>
        <span className="text-ink-1">{percent}%</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => {
          const idx = i + 1;
          const done = idx < stage;
          const active = idx === stage;
          return (
            <div
              key={idx}
              className={cn(
                "h-2 flex-1 border",
                done && "border-accent bg-accent",
                active && "border-accent bg-accent pulse-dot",
                !done && !active && "border-rule bg-paper-elevated",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
