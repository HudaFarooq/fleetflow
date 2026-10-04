"use client";

import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

export function TrackingSearch({ className, defaultValue = "" }: { className?: string; defaultValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) router.push(`/track/${encodeURIComponent(trimmed.toUpperCase())}`);
      }}
      className={cn(
        "group flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 p-1.5 pl-4 backdrop-blur-md",
        "transition focus-within:border-brand-400/60 focus-within:bg-white/15 focus-within:shadow-[0_0_0_4px_rgb(16_185_129/0.15)]",
        className,
      )}
    >
      <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
      <label htmlFor="tracking-id" className="sr-only">
        Tracking ID
      </label>
      <input
        id="tracking-id"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Enter your tracking ID"
        className="h-11 min-w-0 flex-1 bg-transparent font-mono text-sm uppercase tracking-wide text-white placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="submit"
        disabled={!trimmed}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-400 disabled:opacity-50"
      >
        Track
        <ArrowRight className="size-4 transition-transform group-focus-within:translate-x-0.5" aria-hidden />
      </button>
    </form>
  );
}
