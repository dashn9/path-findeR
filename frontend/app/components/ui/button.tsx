"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white border-accent hover:bg-accent-hover hover:border-accent-hover active:bg-accent-press active:border-accent-press",
  secondary:
    "bg-paper-elevated text-ink-1 border-rule-strong hover:bg-paper-sunken",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-paper-sunken hover:text-ink-1",
  danger: "bg-danger text-white border-danger",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs gap-1.5 [&_svg]:size-[13px]",
  md: "px-3.5 py-2 text-[13px] gap-2 [&_svg]:size-3.5",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, children, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center font-medium leading-none border transition-colors duration-100 ease-out",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
        "disabled:opacity-45 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
});
