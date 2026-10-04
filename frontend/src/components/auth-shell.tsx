"use client";

import { motion } from "motion/react";

import { Logo } from "@/components/ui/logo";

const QUOTES = [
  "Booked → Assigned → Picked up → In transit → Delivered",
  "Every step timestamped",
  "Capacity-checked dispatch",
];

/** Split layout: form on the left, animated brand panel on the right (large screens). */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-12">
        <Logo />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto my-auto w-full max-w-sm py-12"
        >
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-slate-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </motion.div>
      </div>

      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <div className="bg-grid absolute inset-0" />
        <motion.div
          className="absolute left-1/4 top-1/4 size-96 rounded-full bg-brand-500/30 blur-[120px]"
          animate={{ x: [0, 80, 0], y: [0, 60, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 size-80 rounded-full bg-sky-glow/20 blur-[120px]"
          animate={{ x: [0, -60, 0], y: [0, -40, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative flex h-full flex-col justify-end p-12">
          <div className="space-y-3">
            {QUOTES.map((quote, index) => (
              <motion.div
                key={quote}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="w-fit rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 backdrop-blur"
              >
                {quote}
              </motion.div>
            ))}
          </div>
          <p className="mt-10 max-w-md text-3xl font-semibold leading-tight text-white">
            The whole delivery journey, visible to everyone who needs it.
          </p>
        </div>
      </div>
    </div>
  );
}
