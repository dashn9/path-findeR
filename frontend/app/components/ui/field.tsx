import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Field({
  label,
  hint,
  children,
  full,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  full?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5 content-start", full && "col-span-full", className)}>
      {label && (
        <label className="font-mono text-[11px] tracking-wide text-ink-2">{label}</label>
      )}
      {children}
      {hint && <div className="font-mono text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}
