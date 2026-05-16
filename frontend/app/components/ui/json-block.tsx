"use client";

import { Fragment, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

type Token = { value: string; cls: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re =
    /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ value: text.slice(last, m.index), cls: "" });
    const match = m[0];
    let cls = "text-warning"; // numbers
    if (/^"/.test(match)) cls = /:\s*$/.test(match) ? "text-purple-700" : "text-success";
    else if (/^(?:true|false)$/.test(match)) cls = "text-accent";
    else if (/^null$/.test(match)) cls = "text-ink-3";
    tokens.push({ value: match, cls });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ value: text.slice(last), cls: "" });
  return tokens;
}

export function JsonBlock({ data, filename }: { data: unknown; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => JSON.stringify(data, null, 2), [data]);
  const tokens = useMemo(() => tokenize(text), [text]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="border border-rule bg-paper-elevated">
      <div className="flex items-center justify-between border-b border-rule bg-paper-sunken px-3.5 py-2">
        <span className="font-mono text-[11px] text-ink-2">{filename ?? "manifest.json"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 border border-rule bg-paper-elevated px-2 py-0.5 font-mono text-[11px] text-ink-2 transition-colors hover:bg-paper-sunken hover:text-ink-1"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="m-0 overflow-auto p-4 font-mono text-[12px] leading-relaxed">
        {tokens.map((t, i) => (
          <Fragment key={i}>{t.cls ? <span className={t.cls}>{t.value}</span> : t.value}</Fragment>
        ))}
      </pre>
    </div>
  );
}
