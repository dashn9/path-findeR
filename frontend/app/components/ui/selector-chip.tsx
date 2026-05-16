"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function SelectorChip({ css }: { css: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(css);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex items-center gap-2.5 border border-rule bg-paper-elevated py-1.5 pr-2 pl-3 transition-colors hover:border-rule-strong">
      <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-accent">
        {css}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        title="Copy selector"
        className="inline-flex flex-none items-center gap-1.5 border border-rule bg-paper-elevated px-2 py-0.5 font-mono text-[11px] text-ink-2 transition-colors hover:bg-paper-sunken hover:text-ink-1"
      >
        {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        <span>{copied ? "copied" : "copy"}</span>
      </button>
    </div>
  );
}
