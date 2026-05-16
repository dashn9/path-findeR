"use client";

import { useId, type ChangeEvent, type ReactNode } from "react";

export function Checkbox({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  label: ReactNode;
  id?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <label htmlFor={fieldId} className="inline-flex items-center gap-2 text-[13px] text-ink-1 cursor-pointer">
      <input
        id={fieldId}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 accent-accent"
      />
      <span>{label}</span>
    </label>
  );
}
