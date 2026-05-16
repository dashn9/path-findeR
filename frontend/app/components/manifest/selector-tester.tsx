"use client";

import { useState } from "react";
import { Play } from "lucide-react";
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

export function SelectorTester({ parser }: { parser: ParserDoc }) {
  const [html, setHtml] = useState(SAMPLE_HTML);
  const [results, setResults] = useState<Record<string, TesterResult | null> | null>(null);

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
              values: nodes.slice(0, 3).map((n) =>
                n.tagName === "IMG" ? n.getAttribute("src") || "" : n.textContent?.trim() || "",
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
  };

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
      <div className="grid content-start gap-2.5">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">Results</div>
        {!results && (
          <div className="border border-dashed border-rule-strong bg-paper-surface p-3.5 font-mono text-xs text-ink-3">
            Run to see what each selector extracts.
          </div>
        )}
        {results &&
          Object.entries(results).map(([label, m]) => (
            <div
              key={label}
              className={cn(
                "grid gap-2 border bg-paper-elevated px-3.5 py-3",
                m ? "border-rule" : "border-danger/20 bg-danger-soft",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{label}</span>
                {m ? (
                  <span className="font-mono text-success">
                    ✓ {m.count} {m.count === 1 ? "match" : "matches"}
                  </span>
                ) : (
                  <span className="font-mono text-danger">✗ 0 matches</span>
                )}
              </div>
              {m && (
                <>
                  <code className="font-mono text-xs text-accent">{m.selector}</code>
                  <div className="grid gap-1">
                    {m.values.map((v, i) => (
                      <div
                        key={i}
                        className="border-l-2 border-highlight bg-highlight-soft px-2 py-1 font-mono text-xs text-ink-1 break-words"
                      >
                        {v || <em>(empty)</em>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
