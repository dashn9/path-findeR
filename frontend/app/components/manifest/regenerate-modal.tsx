"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Modal } from "../ui/modal";
import { Badge } from "../ui/badge";
import type { ParserDoc } from "../../lib/types";

export function RegenerateModal({
  open,
  parser,
  onClose,
  onConfirm,
}: {
  open: boolean;
  parser: ParserDoc | null;
  onClose: () => void;
  onConfirm: (opts: { labels: string[]; force: boolean }) => void;
}) {
  const allLabels = parser?.parser ? Object.keys(parser.parser) : [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (open && parser?.parser) {
      const p = parser.parser;
      setSelected(new Set(allLabels.filter((l) => p[l].unresolved)));
      setForce(false);
    }
  }, [open, parser]);

  const toggle = (label: string) => {
    const next = new Set(selected);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setSelected(next);
  };
  const toggleAll = () => {
    setSelected(selected.size === allLabels.length ? new Set() : new Set(allLabels));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span>
          Regenerate <span className="font-mono text-ink-2">parser_id {parser?._id}</span>
        </span>
      }
      footer={
        <>
          <span className="font-mono text-ink-3">
            {selected.size === 0 || selected.size === allLabels.length
              ? "all labels"
              : `${selected.size} of ${allLabels.length} labels`}
            {force && " · force"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<RefreshCw />}
              onClick={() => onConfirm({ labels: [...selected], force })}
            >
              Regenerate
            </Button>
          </div>
        </>
      }
    >
      <p className="m-0 text-[13px] text-ink-2">
        Selectors for the labels below will be re-derived from the corpus. Existing values are
        replaced when the run completes.
      </p>
      <div className="grid gap-1.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">Labels</span>
          <button
            type="button"
            className="bg-transparent p-0 text-xs text-accent underline underline-offset-2"
            onClick={toggleAll}
          >
            {selected.size === allLabels.length ? "clear" : "select all"}
          </button>
        </div>
        <div className="grid max-h-56 gap-1 overflow-y-auto border border-rule bg-paper-surface p-2">
          {allLabels.map((l) => (
            <label key={l} className="flex items-center gap-2 px-1.5 py-1 text-[13px]">
              <input
                type="checkbox"
                checked={selected.has(l)}
                onChange={() => toggle(l)}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span className="font-mono">{l}</span>
              {parser?.parser?.[l].unresolved && <Badge tone="warning">unresolved</Badge>}
            </label>
          ))}
        </div>
      </div>
      <Checkbox
        checked={force}
        onChange={(e) => setForce(e.target.checked)}
        label="force = true  (skip the 'newer pages exist' check)"
      />
    </Modal>
  );
}
