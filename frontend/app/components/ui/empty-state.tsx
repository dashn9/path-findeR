import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  cta,
}: {
  title: ReactNode;
  body?: ReactNode;
  cta?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2.5 border border-dashed border-rule-strong bg-paper-surface px-8 py-12 text-center">
      <h3 className="m-0 text-lg font-medium">{title}</h3>
      {body && <p className="m-0 font-mono text-xs text-ink-2">{body}</p>}
      {cta}
    </div>
  );
}
