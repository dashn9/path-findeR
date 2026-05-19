"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Inbox, List, RefreshCw, Settings, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { Toast } from "./ui/toast";
import { useStore } from "../lib/store";
import { useHealthQuery } from "../lib/hooks/api/queries/health";
import { useParsersQuery } from "../lib/hooks/api/queries/parsers";
import { cn } from "../lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const { toasts, dismissToast } = useStore();
  const { data: parsers = [] } = useParsersQuery();
  const pathname = usePathname();
  const routeId = pathname.match(/^\/parser\/([^/?#]+)/)?.[1];
  const activeParserId = routeId
    ? parsers.find((p) => p._id === decodeURIComponent(routeId))?._id ?? decodeURIComponent(routeId)
    : null;

  return (
    <div className="flex min-h-full flex-col">
      <TopBar activeParserId={activeParserId} />
      <UnreachableBanner />
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
        <HealthPill />
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

// Derived purely from the react-query state: success → healthy, error →
// unreachable, no data yet → checking. No mirrored store state.
function HealthPill() {
  const q = useHealthQuery();
  let dot = "bg-ink-3", label = "checking…", color = "text-ink-3";
  if (q.isSuccess) {
    dot = "bg-success pulse-dot"; label = "healthy"; color = "text-ink-2";
  } else if (q.isError) {
    dot = "bg-danger"; label = "unreachable"; color = "text-danger";
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px]", color)}>
      <i className={cn("inline-block h-1.5 w-1.5 flex-none rounded-full", dot)} />
      <span className="font-mono">{label}</span>
    </span>
  );
}

function UnreachableBanner() {
  const { baseUrl } = useStore();
  const q = useHealthQuery();
  if (!q.isError) return null;

  return (
    <div
      role="alert"
      className="sticky top-13 z-20 flex items-center gap-3 border-b border-danger/40 bg-danger-soft px-6 py-2 text-xs"
    >
      <AlertTriangle size={14} className="flex-none text-danger" />
      <div className="flex-1 min-w-0 leading-snug">
        <span className="font-mono font-medium text-danger">Service unreachable.</span>{" "}
        <span className="text-ink-2">
          Can't reach <span className="font-mono text-ink-1">{baseUrl}</span>. Feeds and parser
          actions will fail until the connection is restored. Verify the service is running, or
          update the endpoint in <Link href="/settings" className="underline">Settings</Link>.
        </span>
      </div>
      <button
        type="button"
        onClick={() => q.refetch()}
        disabled={q.isFetching}
        className="inline-flex flex-none items-center gap-1.5 border border-danger/40 bg-paper-elevated px-2 py-0.5 font-mono text-[11px] text-danger transition-colors hover:bg-paper-sunken disabled:opacity-45 disabled:cursor-not-allowed"
      >
        <RefreshCw size={12} className={cn(q.isFetching && "animate-spin")} />
        {q.isFetching ? "checking…" : "retry"}
      </button>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const items = [
    {
      href: "/feed",
      label: "Feed",
      Icon: Inbox,
      active: pathname === "/feed" || pathname === "/",
    },
    {
      href: "/parsers",
      label: "Parsers",
      Icon: List,
      // /parser/{id} is the detail view of a parser — belongs under Parsers,
      // not Feed.
      active: pathname.startsWith("/parsers") || pathname.startsWith("/parser/"),
    },
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
