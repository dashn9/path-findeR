"use client";

import { Fragment } from "react";
import type { DomLine } from "../../lib/types";

type Segment = { value: string; cls?: string };

function tokenizeLine(line: string): Segment[] {
  const segments: Segment[] = [];

  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const commentRe = /<!--[\s\S]*?-->/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = commentRe.exec(line)) !== null) {
    if (m.index > last) pushSegments(line.slice(last, m.index), segments);
    segments.push({ value: m[0], cls: "italic text-ink-3" });
    last = commentRe.lastIndex;
  }
  if (last < line.length) pushSegments(line.slice(last), segments);

  return segments.map((s) => ({ ...s, value: escape(s.value).replace(/&amp;(amp|lt|gt);/g, "&$1;") }));

  function pushSegments(chunk: string, out: Segment[]) {
    const re = /(<\/?)([a-z][a-z0-9-]*)|\s+([a-z\-]+)=("[^"]*")/gi;
    let pos = 0;
    let token: RegExpExecArray | null;
    while ((token = re.exec(chunk)) !== null) {
      if (token.index > pos) out.push({ value: chunk.slice(pos, token.index) });
      if (token[2]) {
        out.push({ value: token[1] });
        out.push({ value: token[2], cls: "text-accent" });
      } else if (token[3] && token[4]) {
        out.push({ value: " " });
        out.push({ value: token[3], cls: "text-ink-2" });
        out.push({ value: "=" });
        out.push({ value: token[4], cls: "text-success" });
      }
      pos = re.lastIndex;
    }
    if (pos < chunk.length) out.push({ value: chunk.slice(pos) });
  }
}

export function DomContext({ lines }: { lines: DomLine[] }) {
  return (
    <pre className="m-0 overflow-x-auto border border-rule bg-paper-elevated px-3.5 py-3 font-mono text-[12px] leading-7 text-ink-1">
      {lines.map((line) => (
        <span
          key={line.i}
          className={
            line.match
              ? "grid grid-cols-[32px_1fr_auto] gap-1.5 items-baseline py-px -mx-3.5 px-3.5 bg-highlight shadow-[inset_3px_0_0_var(--color-ink-1)]"
              : "grid grid-cols-[32px_1fr_auto] gap-1.5 items-baseline py-px"
          }
        >
          <span
            className={
              line.match
                ? "select-none text-right pr-1.5 border-r border-ink-1/20 text-ink-1"
                : "select-none text-right pr-1.5 border-r border-rule text-ink-3"
            }
          >
            {String(line.i + 1).padStart(2, " ")}
          </span>
          <span className="whitespace-pre">
            {tokenizeLine(line.t).map((seg, i) =>
              seg.cls ? (
                <span key={i} className={line.match ? "text-ink-1" : seg.cls}>
                  {decodeEntities(seg.value)}
                </span>
              ) : (
                <Fragment key={i}>{decodeEntities(seg.value)}</Fragment>
              ),
            )}
          </span>
          {line.match && (
            <span className="pl-3 font-mono text-[10px] tracking-wide text-ink-1">← match</span>
          )}
        </span>
      ))}
    </pre>
  );
}

function decodeEntities(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
