"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Play } from "lucide-react";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Textarea } from "../ui/input";
import { SAMPLE_HTML } from "../../lib/mockData";
import type { ParserDoc } from "../../lib/types";
import { cn } from "../../lib/utils";

interface TesterResult {
  selector: string;
  values: string[];
  count: number;
}

// Cap on how many extracted values we render per label — bounded so a
// thousand-item array doesn't choke the page.
const MAX_VALUES = 25;

export function SelectorTester({ parser }: { parser: ParserDoc }) {
  const [html, setHtml] = useState(SAMPLE_HTML);
  const [results, setResults] = useState<Record<string, TesterResult | null> | null>(null);
  // Per-label collapse state. Each result row folds independently; the
  // Results section as a whole stays open. Missing keys default to "open".
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const ready = !!parser.parser;

  const toggle = (label: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const run = () => {
    if (!parser.parser) return;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const out: Record<string, TesterResult | null> = {};
    for (const [label, def] of Object.entries(parser.parser)) {
      let matched: TesterResult | null = null;
      for (const sel of def.selectors) {
        try {
          const nodes = def.array
            ? Array.from(doc.querySelectorAll(sel.css))
            : ([doc.querySelector(sel.css)].filter(Boolean) as Element[]);
          if (nodes.length > 0) {
            matched = {
              selector: sel.css,
              values: nodes
                .slice(0, MAX_VALUES)
                .map((n) =>
                  n.tagName === "IMG"
                    ? n.getAttribute("src") || ""
                    : n.textContent?.trim() || "",
                ),
              count: nodes.length,
            };
            break;
          }
        } catch {
          /* invalid selector */
        }
      }
      out[label] = matched;
    }
    setResults(out);
    // Fresh run: auto-collapse the misses (less noise), expand the hits.
    const next = new Set<string>();
    for (const [label, m] of Object.entries(out)) {
      if (!m) next.add(label);
    }
    setCollapsed(next);
  };

  const summary = results
    ? (() => {
        const entries = Object.entries(results);
        const hits = entries.filter(([, m]) => m).length;
        return `${hits}/${entries.length} matched`;
      })()
    : null;

  return (
    <div className="grid gap-5 max-[1100px]:grid-cols-1 [@media(min-width:1100px)]:grid-cols-2">
      <div className="grid gap-3">
        <Field label="paste html" hint="document.querySelector(All) runs against this in your browser.">
          <Textarea mono rows={18} value={html} onChange={(e) => setHtml(e.target.value)} />
        </Field>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setHtml("");
              setResults(null);
            }}
          >
            Clear
          </Button>
          <Button variant="primary" icon={<Play />} onClick={run}>
            Run selectors
          </Button>
        </div>
      </div>
      <div className="grid content-start gap-2.5 min-w-0">
        {!results ? (
          <>
            <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">Results</div>
            <div className="border border-dashed border-rule-strong bg-paper-surface p-3.5 font-mono text-xs text-ink-3">
              {ready
                ? "Run to see what each selector extracts."
                : "Parser hasn't generated selectors yet — feed enough pages (or Force run) to produce a manifest first."}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
                Results
              </span>
              <span className="font-mono text-[11px] text-ink-2">{summary}</span>
            </div>
            {/* Bounded scroll on the whole results body. ~32rem keeps a
                handful of labels visible before the wheel takes over.
                Each card inside folds independently. */}
            <div className="max-h-[32rem] overflow-y-auto border border-rule bg-paper-surface">
              <div className="grid gap-2.5 p-3">
                {Object.entries(results).map(([label, m]) => {
                  const isOpen = !collapsed.has(label);
                  return (
                    <div
                      key={label}
                      className={cn(
                        "border bg-paper-elevated",
                        m ? "border-rule" : "border-danger/20 bg-danger-soft",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(label)}
                        className="grid w-full cursor-pointer grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-paper-sunken"
                      >
                        {isOpen ? (
                          <ChevronDown size={14} className="text-ink-3" />
                        ) : (
                          <ChevronRight size={14} className="text-ink-3" />
                        )}
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-ink-1">
                          {label}
                        </span>
                        {m ? (
                          <span className="flex-none font-mono text-xs text-success">
                            ✓ {m.count} {m.count === 1 ? "match" : "matches"}
                          </span>
                        ) : (
                          <span className="flex-none font-mono text-xs text-danger">
                            ✗ 0 matches
                          </span>
                        )}
                      </button>
                      {isOpen && m && (
                        <div className="grid gap-2 border-t border-rule px-3.5 py-3">
                          <code className="overflow-x-auto whitespace-nowrap font-mono text-xs text-accent">
                            {m.selector}
                          </code>
                          <div className="grid gap-1">
                            {m.values.map((v, i) => (
                              <div
                                key={i}
                                className="border-l-2 border-highlight bg-highlight-soft px-2 py-1 font-mono text-xs text-ink-1 break-words"
                              >
                                {v || <em className="text-ink-3">(empty)</em>}
                              </div>
                            ))}
                            {m.count > m.values.length && (
                              <div className="px-2 py-1 font-mono text-[11px] text-ink-3">
                                …{m.count - m.values.length} more not shown
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
