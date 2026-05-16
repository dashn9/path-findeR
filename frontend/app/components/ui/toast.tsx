"use client";

import { AlertTriangle, Check, CircleDot, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type Kind = "success" | "error" | "info";

const kindBorder: Record<Kind, string> = {
  success: "border-l-success",
  error: "border-l-danger",
  info: "border-l-accent",
};

export function Toast({
  kind = "info",
  title,
  body,
  onDismiss,
}: {
  kind?: Kind;
  title?: ReactNode;
  body?: ReactNode;
  onDismiss?: () => void;
}) {
  const iconNode =
    kind === "success" ? (
      <Check size={16} className="text-success" />
    ) : kind === "error" ? (
      <AlertTriangle size={16} className="text-danger" />
    ) : (
      <CircleDot size={16} className="text-accent" />
    );

  return (
    <div
      role="status"
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[2px] border border-rule border-l-[3px] bg-paper-elevated p-3 shadow-lg toast-in",
        kindBorder[kind],
      )}
    >
      {iconNode}
      <div>
        {title && <div className="text-[13px] font-medium text-ink-1">{title}</div>}
        {body && <div className="font-mono text-[11px] text-ink-2">{body}</div>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 text-ink-3 transition-colors hover:text-ink-1"
        aria-label="Dismiss notification"
      >
        <X size={13} />
      </button>
    </div>
  );
}
