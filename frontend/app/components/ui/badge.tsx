import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type Tone = "neutral" | "accent" | "warning" | "danger" | "type";

const tones: Record<Tone, string> = {
  neutral: "bg-paper text-ink-2 border-rule",
  accent: "bg-accent-soft text-accent border-accent/20",
  type: "bg-accent-soft text-accent border-accent/20",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs border px-1.5 py-px font-mono text-[11px] tracking-tight",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
