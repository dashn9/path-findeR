"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const baseField =
  "block w-full bg-paper-elevated text-ink-1 border border-rule-strong px-2.5 py-2 text-[13px] outline-none transition-colors duration-100 ease-out " +
  "placeholder:text-ink-3 hover:border-ink-3 " +
  "focus:border-accent focus:outline focus:outline-2 focus:outline-accent focus:-outline-offset-1";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { mono, className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(baseField, mono && "font-mono", className)} {...rest} />;
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { mono, rows = 6, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(baseField, "leading-relaxed resize-y", mono && "font-mono", className)}
      {...rest}
    />
  );
});
