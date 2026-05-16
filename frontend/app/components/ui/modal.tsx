"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(22,20,14,0.35)] fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(560px,calc(100vw-48px))] max-h-[calc(100vh-96px)] overflow-auto border border-rule bg-paper-elevated rounded-[4px] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-rule px-4 py-3">
          <div className="text-[15px] font-medium text-ink-1">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 text-ink-3 transition-colors hover:text-ink-1"
          >
            <X size={14} />
          </button>
        </header>
        <div className="grid gap-3.5 p-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-between border-t border-rule bg-paper-surface px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
