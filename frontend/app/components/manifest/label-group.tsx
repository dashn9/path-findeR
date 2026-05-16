import { AlertTriangle } from "lucide-react";
import { Badge } from "../ui/badge";
import { SelectorChip } from "../ui/selector-chip";
import type { LabelDef } from "../../lib/types";
import { cn } from "../../lib/utils";

export function LabelGroup({ name, def }: { name: string; def: LabelDef }) {
  return (
    <section
      className={cn(
        "grid gap-3 border border-rule bg-paper-surface px-[18px] py-4",
        def.unresolved && "border-l-[3px] border-l-warning pl-4",
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h3 className="m-0 text-[17px] font-medium text-ink-1">{name}</h3>
          <div className="inline-flex flex-wrap gap-1">
            {def.concrete_types?.map((t) => (
              <Badge key={t} tone="type">
                {t}
              </Badge>
            ))}
            {def.abstract_types?.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
            {def.array && <Badge tone="accent">array</Badge>}
            {def.unresolved && <Badge tone="warning">unresolved</Badge>}
          </div>
        </div>
        <div className="flex-none font-mono text-[11px] text-ink-3">
          {def.selectors.length} {def.selectors.length === 1 ? "selector" : "selectors"}
        </div>
      </header>
      <div className="grid gap-1.5">
        {def.selectors.map((s, i) => (
          <SelectorChip key={i} css={s.css} />
        ))}
      </div>
      {def.unresolved && (
        <div className="inline-flex items-center gap-2 border border-warning/25 bg-warning-soft px-2.5 py-2 font-mono text-xs text-warning">
          <AlertTriangle size={13} />
          Validation failed across the corpus. Regenerate or feed more pages.
        </div>
      )}
    </section>
  );
}
