"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: ReactNode }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex border-b border-rule">
      {tabs.map((t) => {
        const isOn = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isOn}
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex items-center gap-2 -mb-px border-b-2 border-transparent px-4 py-2.5 text-[13px] transition-colors duration-100 ease-out",
              isOn ? "text-ink-1 border-accent font-medium" : "text-ink-2 hover:text-ink-1",
            )}
          >
            {t.label}
            {t.badge != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px font-mono text-[10px]",
                  isOn ? "bg-accent-soft text-accent" : "bg-paper-sunken text-ink-2",
                )}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
