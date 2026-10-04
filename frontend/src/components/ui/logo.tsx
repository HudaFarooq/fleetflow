import Link from "next/link";

import { cn } from "@/lib/utils";

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)}>
      <span className="relative grid size-9 place-items-center rounded-xl bg-linear-to-br from-brand-400 to-sky-glow shadow-lg shadow-brand-500/30 transition-transform duration-300 group-hover:rotate-6">
        <svg viewBox="0 0 24 24" className="size-5 text-ink-950" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
          <path d="M4 17c3 0 4-10 8-10s5 10 8 10" strokeLinecap="round" />
          <circle cx="12" cy="7" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span className={cn("text-lg font-semibold tracking-tight", dark ? "text-white" : "text-slate-900")}>
        FleetFlow
      </span>
    </Link>
  );
}
