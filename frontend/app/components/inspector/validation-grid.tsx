import { cn } from "../../lib/utils";

export function ValidationGrid({
  pages,
  matrix,
  activeRow,
}: {
  pages: { url: string; short: string }[];
  matrix: number[][];
  activeRow: number;
}) {
  const cols = pages.length;
  const template = `56px repeat(${cols}, minmax(0, 1fr))`;
  const rowTemplate = `${template} 38px`;

  return (
    <div className="grid gap-1">
      <div
        className="grid items-center gap-1 font-mono text-[10px] tracking-wide text-ink-3"
        style={{ gridTemplateColumns: template }}
      >
        <div />
        {pages.map((p, i) => (
          <div key={i} className="text-center" title={p.url}>
            {String(i + 1).padStart(2, "0")}
          </div>
        ))}
      </div>
      {matrix.map((row, si) => {
        const okCount = row.filter(Boolean).length;
        return (
          <div
            key={si}
            className={cn(
              "grid items-center gap-1 border bg-paper-elevated px-1.5 py-1 transition-colors",
              si === activeRow ? "border-ink-1 bg-paper-sunken" : "border-rule",
            )}
            style={{ gridTemplateColumns: rowTemplate }}
          >
            <div className="font-mono text-[10px] tracking-wide text-ink-2">
              sel {String(si + 1).padStart(2, "0")}
            </div>
            {row.map((v, pi) => (
              <div
                key={pi}
                title={`${pages[pi].short} · ${v ? "matched" : "no match"}`}
                className={cn(
                  "h-4.5 border",
                  v ? "border-success/60 bg-success" : "miss-hatched border-rule-strong bg-paper",
                )}
              />
            ))}
            <div
              className={cn(
                "text-right font-mono text-[10.5px]",
                si === activeRow ? "font-bold text-ink-1" : "text-ink-2",
              )}
            >
              {okCount}/{row.length}
            </div>
          </div>
        );
      })}
    </div>
  );
}
