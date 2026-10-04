"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";

export function CallToAction() {
  return (
    <section className="bg-white px-4 pb-24 sm:px-6">
      <Reveal className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-ink-950 px-6 py-16 text-center sm:px-16">
          <motion.div
            className="absolute -top-24 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand-500/25 blur-[120px]"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="bg-grid absolute inset-0 opacity-40" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              See it working in under a minute
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
              Log in with a demo account as a customer, dispatcher or driver, and follow a parcel through the whole journey.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/login" size="lg" className="group">
                Try the demo
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </ButtonLink>
              <ButtonLink href="/track" variant="glass" size="lg">
                Track a parcel
              </ButtonLink>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
