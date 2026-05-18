"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, List, Settings, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { Toast } from "./ui/toast";
import { useStore } from "../lib/store";
import { cn } from "../lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const { toasts, dismissToast, parsers } = useStore();
  const pathname = usePathname();
  const routeId = pathname.match(/^\/parser\/([^/?#]+)/)?.[1];
  const activeParserId = routeId
    ? parsers.find((p) => p._id === decodeURIComponent(routeId))?._id ?? decodeURIComponent(routeId)
    : null;

  return (
    <div className="flex min-h-full flex-col">
      <TopBar activeParserId={activeParserId} />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 max-w-7xl px-12 pt-8 pb-24">{children}</main>
      </div>

      <div className="fixed bottom-6 right-6 z-40 grid gap-2 w-[min(360px,calc(100vw-48px))]">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            kind={t.kind}
            title={t.title}
            body={t.body}
            onDismiss={() => dismissToast(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TopBar({ activeParserId }: { activeParserId: string | null }) {
  return (
    <header className="sticky top-0 z-10 grid h-13 grid-cols-[240px_1fr_auto] items-center border-b border-rule bg-paper px-6">
      <Link href="/feed" className="inline-flex items-baseline font-mono text-base font-bold no-underline">
        <span className="bg-highlight px-1 mr-0.5 text-ink-1">/</span>
        <span className="text-ink-1">path-findeR</span>
      </Link>

      <div className="flex justify-start">
        {activeParserId && (
          <Link
            href={`/parser/${encodeURIComponent(activeParserId)}`}
            className="inline-flex items-center gap-1.5 rounded-xs border border-rule bg-paper-elevated px-2.5 py-1 text-xs text-ink-2 no-underline transition-colors hover:border-rule-strong"
          >
            <Terminal size={12} />
            <span className="font-mono">parser_id:&nbsp;</span>
            <span className="font-mono font-medium text-ink-1">{activeParserId}</span>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-2">
          <i className="inline-block h-1.5 w-1.5 flex-none rounded-full bg-success pulse-dot" />
          <span className="font-mono">healthy</span>
        </span>
        <Link
          href="/settings"
          className="grid h-7 w-7 place-items-center rounded-xs text-ink-2 transition-colors hover:bg-paper-sunken hover:text-ink-1"
          aria-label="Settings"
        >
          <Settings size={16} />
        </Link>
      </div>
    </header>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const items = [
    {
      href: "/feed",
      label: "Feed",
      Icon: Inbox,
      active: pathname === "/feed" || pathname === "/" || pathname.startsWith("/parser"),
    },
    { href: "/history", label: "History", Icon: List, active: pathname.startsWith("/history") },
    { href: "/settings", label: "Settings", Icon: Settings, active: pathname.startsWith("/settings") },
  ];

  return (
    <nav className="sticky top-13 flex h-[calc(100vh-52px)] w-60 flex-none flex-col gap-6 overflow-y-auto border-r border-rule bg-paper p-6 px-4">
      <div className="grid gap-1">
        <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">Actions</div>
        {items.map(({ href, label, Icon, active }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-xs px-2.5 py-1.5 text-[13px] no-underline transition-colors duration-100",
              active
                ? "border border-rule bg-paper-elevated text-ink-1 px-2.25 py-1.5"
                : "text-ink-2 hover:bg-paper-sunken hover:text-ink-1",
            )}
          >
            <Icon size={14} />
            <span>{label}</span>
          </Link>
        ))}
      </div>
      <div className="grid gap-1">
        <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">Endpoint</div>
        <div className="flex gap-2 overflow-hidden border border-rule bg-paper-elevated px-2.5 py-2 font-mono text-[11px] text-ink-2">
          <span className="font-bold text-accent">GET</span>
          <span>http://localhost:7117</span>
        </div>
      </div>
      <div className="mt-auto border-t border-rule px-2 pt-2 font-mono text-[10px] text-ink-3">
        v0.4.2 · go service
      </div>
    </nav>
  );
}
