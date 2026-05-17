"use client";

import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import { Badge } from "../ui/badge";
import { DomContext } from "./dom-context";
import { ValidationGrid } from "./validation-grid";
import { ActivityLog } from "./activity-log";
import { MOCK_TRACES } from "../../lib/mockData";
import type { ParserDoc, ParserTrace } from "../../lib/types";
import { cn } from "../../lib/utils";

export function RunInspector({ parser }: { parser: ParserDoc }) {
  const trace = MOCK_TRACES[parser._id];
  const allLabels = parser.parser ? Object.keys(parser.parser) : [];
  const initialLabel = allLabels[0] ?? null;
  const [activeLabel, setActiveLabel] = useState<string | null>(initialLabel);
  const [activeCand, setActiveCand] = useState(() => chosenIndex(trace, initialLabel));
  const [pageIdx, setPageIdx] = useState(0);

  // Reset candidate index in the same event that switches labels — avoids the
  // set-state-in-effect anti-pattern.
  const selectLabel = (l: string) => {
    setActiveLabel(l);
    setActiveCand(chosenIndex(trace, l));
  };

  if (!trace) {
    return (
      <EmptyState
        title="No run trace recorded"
        body="Inspector requires telemetry from a completed run. Feed pages and re-run to capture."
      />
    );
  }
  if (!activeLabel || !parser.parser) return null;

  const lab = trace.labels[activeLabel];
  const def = parser.parser[activeLabel];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center border border-rule bg-paper-surface px-2.5 py-1.5">
        <span className="pr-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-3">Labels</span>
        {allLabels.map((l, idx) => {
          const isOn = l === activeLabel;
          const unresolved = parser.parser![l].unresolved;
          return (
            <button
              key={l}
              type="button"
              onClick={() => selectLabel(l)}
              className={cn(
                "inline-flex items-center gap-1.5 border-r border-rule px-2.5 py-1 text-xs transition-colors",
                idx === 0 && "border-l ml-1.5",
                isOn ? "bg-ink-1 text-white border-ink-1" : "text-ink-2 hover:bg-paper-sunken hover:text-ink-1",
              )}
            >
              <span className="font-mono">{l}</span>
              {unresolved && <AlertTriangle size={11} className={isOn ? "text-warning-soft" : "text-warning"} />}
            </button>
          );
        })}
      </div>

      <header
        className={cn(
          "grid grid-cols-[1fr_auto] items-center gap-6 border border-rule bg-paper-elevated px-5 py-4.5",
          lab.unresolved && "border-l-3 border-l-warning pl-4.75",
        )}
      >
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">label</div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="m-0 text-[22px] font-medium text-ink-1">{activeLabel}</h2>
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
              {lab.unresolved && <Badge tone="warning">unresolved</Badge>}
            </div>
          </div>
        </div>
        <div className="grid justify-items-end gap-1 min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
            chosen selector{lab.chosen < 0 ? " · none" : ""}
          </div>
          {lab.chosen >= 0 ? (
            <code className="max-w-130 overflow-x-auto whitespace-nowrap bg-highlight px-2.5 py-0.5 font-mono text-[13px] leading-normal text-ink-1">
              {lab.candidates[lab.chosen].css}
            </code>
          ) : (
            <code className="max-w-130 overflow-x-auto whitespace-nowrap bg-danger-soft px-2.5 py-0.5 font-mono text-[13px] leading-normal text-danger">
              — validation failed across the corpus
            </code>
          )}
        </div>
      </header>

      <div className="grid items-start gap-4 max-[1280px]:grid-cols-2 max-[900px]:grid-cols-1 [@media(min-width:1280px)]:grid-cols-[minmax(0,1.05fr)_minmax(0,1.1fr)_minmax(0,0.95fr)]">
        <section className="grid gap-3 border border-rule bg-paper-surface p-4 min-w-0">
          <header className="flex items-center justify-between border-b border-rule pb-2.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              Candidate selectors · ranked by score
            </span>
            <span className="font-mono text-ink-3">top_n = {lab.candidates.length}</span>
          </header>
          <ol className="m-0 grid list-none gap-1.5 p-0">
            {lab.candidates.map((c, i) => {
              const active = i === activeCand;
              const chosen = i === lab.chosen;
              const barColor =
                c.score >= 0.75 ? "bg-ink-1" : c.score >= 0.5 ? "bg-ink-2" : "bg-ink-3";
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setActiveCand(i)}
                    className={cn(
                      "grid w-full grid-cols-[auto_auto_1fr] items-center gap-3 border bg-paper-elevated px-3 py-2.5 text-left transition-colors",
                      active && "border-ink-1",
                      chosen && "border-l-3 border-l-ink-1 pl-2.25",
                      chosen && active && "bg-accent-soft",
                      !active && "hover:border-rule-strong",
                      !active && !chosen && "border-rule",
                    )}
                  >
                    <span
                      className={cn(
                        "w-4.5 text-center font-mono",
                        chosen ? "text-[13px] text-ink-1" : "text-[11px] text-ink-3",
                      )}
                    >
                      {chosen ? "★" : String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="grid w-22 gap-1">
                      <div className="font-mono text-[13px] font-medium leading-none text-ink-1">
                        {c.score.toFixed(2)}
                      </div>
                      <div className="h-1 bg-paper-sunken">
                        <div
                          className={cn("h-full transition-[width] duration-200 ease-out", barColor)}
                          style={{ width: `${Math.round(c.score * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="min-w-0 grid gap-1">
                      <code className="block min-w-0 overflow-x-auto whitespace-nowrap font-mono text-[12.5px] text-accent">
                        {c.css}
                      </code>
                      <div className={cn("font-mono text-[11px]", active ? "text-ink-2" : "text-ink-3")}>
                        {c.note}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="grid gap-3 border border-rule bg-paper-surface p-4 pb-3 min-w-0">
          <header className="flex items-center justify-between border-b border-rule pb-2.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              DOM context · page {pageIdx + 1} of {trace.pages.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => setPageIdx((i) => (i - 1 + trace.pages.length) % trace.pages.length)}
                className="grid h-5.5 w-5.5 place-items-center border border-rule bg-paper-elevated text-ink-2 transition-colors hover:bg-paper-sunken hover:text-ink-1"
              >
                <ChevronLeft size={12} />
              </button>
              <code className="font-mono text-[11px] text-ink-2">{trace.pages[pageIdx].short}</code>
              <button
                type="button"
                aria-label="Next page"
                onClick={() => setPageIdx((i) => (i + 1) % trace.pages.length)}
                className="grid h-5.5 w-5.5 place-items-center border border-rule bg-paper-elevated text-ink-2 transition-colors hover:bg-paper-sunken hover:text-ink-1"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </header>
          <DomContext lines={lab.dom} />
          <footer className="grid grid-cols-[auto_1fr] items-center gap-3.5 border-t border-rule pt-2.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">Extracted</span>
            <div className="flex flex-wrap gap-1.5">
              {lab.values.slice(0, 4).map((v, i) => {
                const empty = v.startsWith("(");
                return (
                  <code
                    key={i}
                    className={cn(
                      "border px-2 py-0.5 font-mono text-[11.5px]",
                      empty
                        ? "border-rule bg-paper-sunken text-ink-3"
                        : "border-rule bg-paper-elevated text-ink-1",
                    )}
                  >
                    {v}
                  </code>
                );
              })}
              {lab.values.length > 4 && (
                <span className="font-mono text-ink-3">+{lab.values.length - 4} more</span>
              )}
            </div>
          </footer>
        </section>

        <section className="grid gap-4">
          <div className="grid gap-2.5 border border-rule bg-paper-surface px-4 py-3.5">
            <header className="flex items-center justify-between border-b border-rule pb-2.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
                Cross-corpus validation
              </span>
              <span className="font-mono text-ink-3">
                {trace.pages.length} pages × {lab.candidates.length} sel
              </span>
            </header>
            <ValidationGrid pages={trace.pages} matrix={lab.validation} activeRow={activeCand} />
            <div className="flex gap-3.5 pt-1 font-mono text-[10.5px] text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 border border-success bg-success" />
                match
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 border border-rule-strong bg-paper" />
                miss
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 border-2 border-ink-1 bg-transparent" />
                active row
              </span>
            </div>
          </div>

          <div className="grid gap-2.5 border border-rule bg-paper-surface px-4 py-3.5">
            <header className="flex items-center justify-between border-b border-rule pb-2.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">LLM rationale</span>
              <span className="font-mono text-ink-3">gpt-4o-mini</span>
            </header>
            <blockquote className="m-0 border border-rule border-l-3 border-l-ink-1 bg-paper-elevated px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink-1">
              {lab.rationale}
            </blockquote>
          </div>
        </section>
      </div>

      <ActivityLog rows={trace.activity} />
    </div>
  );
}

function chosenIndex(trace: ParserTrace | undefined, label: string | null): number {
  if (!trace || !label) return 0;
  const lab = trace.labels[label];
  return lab && lab.chosen >= 0 ? lab.chosen : 0;
}
