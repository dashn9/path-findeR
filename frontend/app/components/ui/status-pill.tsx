import { cn } from "../../lib/utils";

type Status = "pending" | "running" | "done" | "failed";

const toneByStatus: Record<Status, { border: string; name: string }> = {
  pending: {
    border: "border-rule",
    name: "bg-paper-elevated text-ink-2",
  },
  running: {
    border: "border-warning/35",
    name: "bg-warning-soft text-warning",
  },
  done: {
    border: "border-success/35",
    name: "bg-success-soft text-success",
  },
  failed: {
    border: "border-danger/35",
    name: "bg-danger-soft text-danger",
  },
};

const stageLabels = ["feed", "analyze", "label", "emit"] as const;

export function StatusPill({
  status,
  stage,
  failStage,
  compact,
}: {
  status?: string;
  stage?: number;
  failStage?: number;
  compact?: boolean;
}) {
  const s = (status as Status) || "pending";
  let filled = stage;
  let fail = failStage;
  if (filled == null) {
    if (s === "pending") filled = 0;
    else if (s === "running") filled = 1;
    else if (s === "done") filled = 4;
    else if (s === "failed") {
      filled = 2;
      if (fail == null) fail = 3;
    }
  }
  const tone = toneByStatus[s];
  const cellWidth = compact ? "w-3.5" : "w-[18px]";
  const namePad = compact ? "px-2 py-[3px] text-[10.5px]" : "px-2.5 py-1 text-[11px]";

  return (
    <span
      className={cn(
        "inline-flex items-stretch border bg-paper-elevated font-mono leading-none",
        tone.border,
      )}
    >
      <span className="grid grid-cols-4 border-r border-rule bg-paper">
        {[0, 1, 2, 3].map((i) => {
          const isFail = fail != null && i === fail - 1;
          const isOn = !isFail && i < (filled ?? 0);
          const isCur = !isFail && !isOn && s === "running" && i === filled;
          return (
            <span
              key={i}
              className={cn(
                "grid place-items-center border-r border-rule last:border-r-0",
                cellWidth,
              )}
              title={stageLabels[i]}
            >
              <span
                className={cn(
                  "block",
                  isFail
                    ? "h-[7px] w-[7px] bg-danger"
                    : "h-[5px] w-[5px] " +
                        (isOn ? "bg-ink-1" : isCur ? "bg-warning pulse-dot" : "bg-rule"),
                )}
              />
            </span>
          );
        })}
      </span>
      <span className={cn("self-center tracking-wide", namePad, tone.name)}>{s}</span>
    </span>
  );
}
