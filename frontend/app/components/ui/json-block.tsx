"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { cn } from "../../lib/utils";

// JsonBlock renders a JSON value as a collapsible tree. Objects and arrays
// fold on click; the copy button still serializes the full structure.

const INDENT = "ml-3 border-l border-rule pl-3";

export function JsonBlock({ data, filename }: { data: unknown; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => JSON.stringify(data, null, 2), [data]);

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
    <div className="min-w-0 border border-rule bg-paper-elevated">
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
      <div className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed">
        <JsonNode value={data} depth={0} />
      </div>
    </div>
  );
}

function JsonNode({
  value,
  name,
  depth,
  trailingComma,
}: {
  value: unknown;
  name?: string | number;
  depth: number;
  trailingComma?: boolean;
}) {
  const isArray = Array.isArray(value);
  const isObject = !isArray && value !== null && typeof value === "object";

  if (!isArray && !isObject) {
    return <Leaf name={name} value={value} trailingComma={trailingComma} />;
  }

  return (
    <CollapsibleNode
      value={value as object | unknown[]}
      isArray={isArray}
      name={name}
      depth={depth}
      trailingComma={trailingComma}
    />
  );
}

function CollapsibleNode({
  value,
  isArray,
  name,
  depth,
  trailingComma,
}: {
  value: object | unknown[];
  isArray: boolean;
  name?: string | number;
  depth: number;
  trailingComma?: boolean;
}) {
  // Heuristic: top level wide open, depth-1 also open, deeper closed by
  // default so a fresh render isn't a wall of nested arrays.
  const [open, setOpen] = useState(depth < 1);

  const entries: ReadonlyArray<readonly [string | number, unknown]> = isArray
    ? (value as unknown[]).map((v, i) => [i, v] as const)
    : Object.entries(value as Record<string, unknown>);
  const count = entries.length;
  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";

  const empty = count === 0;
  // Empty objects/arrays collapse to a single line; the chevron toggle is
  // pointless when there are no children.
  if (empty) {
    return (
      <div className="flex items-start">
        <span className="inline-block w-3.5 flex-none" />
        {name !== undefined && <Key name={name} />}
        <span className="text-ink-2">
          {openBracket}
          {closeBracket}
        </span>
        {trailingComma && <span className="text-ink-3">,</span>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start text-left hover:bg-paper-sunken"
      >
        {open ? (
          <ChevronDown size={14} className="mt-[2px] flex-none text-ink-3" />
        ) : (
          <ChevronRight size={14} className="mt-[2px] flex-none text-ink-3" />
        )}
        {name !== undefined && <Key name={name} />}
        <span className="text-ink-2">{openBracket}</span>
        {!open && (
          <>
            <span className="px-1.5 text-ink-3">
              … {count} {isArray ? (count === 1 ? "item" : "items") : count === 1 ? "key" : "keys"}
            </span>
            <span className="text-ink-2">{closeBracket}</span>
            {trailingComma && <span className="text-ink-3">,</span>}
          </>
        )}
      </button>

      {open && (
        <>
          <div className={INDENT}>
            {entries.map(([k, v], i) => (
              <JsonNode
                key={k}
                name={k}
                value={v}
                depth={depth + 1}
                trailingComma={i < count - 1}
              />
            ))}
          </div>
          <div className="flex items-start">
            <span className="inline-block w-3.5 flex-none" />
            <span className="text-ink-2">{closeBracket}</span>
            {trailingComma && <span className="text-ink-3">,</span>}
          </div>
        </>
      )}
    </div>
  );
}

function Leaf({
  name,
  value,
  trailingComma,
}: {
  name?: string | number;
  value: unknown;
  trailingComma?: boolean;
}) {
  return (
    <div className="flex items-start">
      <span className="inline-block w-3.5 flex-none" />
      {name !== undefined && <Key name={name} />}
      <LeafValue value={value} />
      {trailingComma && <span className="text-ink-3">,</span>}
    </div>
  );
}

function Key({ name }: { name: string | number }) {
  const isIndex = typeof name === "number";
  return (
    <span
      className={cn(
        "mr-1.5 flex-none",
        isIndex ? "text-ink-3" : "text-purple-700",
      )}
    >
      {isIndex ? name : `"${name}"`}
      <span className="text-ink-3">: </span>
    </span>
  );
}

function LeafValue({ value }: { value: unknown }) {
  if (value === null) return <span className="text-ink-3">null</span>;
  if (value === undefined) return <span className="text-ink-3">undefined</span>;
  if (typeof value === "boolean") {
    return <span className="text-accent">{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-warning">{String(value)}</span>;
  }
  if (typeof value === "string") {
    return (
      <span className="min-w-0 text-success break-words">{`"${value}"`}</span>
    );
  }
  return <span className="text-ink-2">{String(value)}</span>;
}
