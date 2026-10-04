"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { Fragment } from "react";

import { HeroVisual } from "@/components/landing/hero-visual";
import { TrackingSearch } from "@/components/track/tracking-search";
import { ButtonLink } from "@/components/ui/button";

const HEADLINE = ["Every", "parcel.", "Every", "vehicle."];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-ink-950 pb-24 pt-32 sm:pt-40">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      <motion.div
        className="absolute -left-40 top-20 size-[28rem] rounded-full bg-brand-500/20 blur-[120px]"
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-32 top-60 size-[24rem] rounded-full bg-sky-glow/15 blur-[120px]"
        animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-xs font-medium text-brand-300"
          >
            <Sparkles className="size-3.5" />
            Delivery and fleet management, one platform
          </motion.span>

          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
            {HEADLINE.map((word, index) => (
              <Fragment key={index}>
                <motion.span
                  className="inline-block"
                  initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.7, delay: 0.1 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  {word}
                </motion.span>{" "}
              </Fragment>
            ))}
            <motion.span
              className="block bg-linear-to-r from-brand-300 via-brand-400 to-sky-glow bg-clip-text text-transparent"
              initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              One live map.
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="mt-6 max-w-lg text-lg leading-relaxed text-slate-400"
          >
            Book deliveries, dispatch them to the right vehicle, and follow every step from the depot to the doorstep.
            Built for fleets that are going electric.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.6 }}
            className="mt-8 max-w-lg space-y-4"
          >
            <TrackingSearch />
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/register" size="lg" className="group">
                Start shipping
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </ButtonLink>
              <ButtonLink href="/login" variant="glass" size="lg">
                Try a demo account
              </ButtonLink>
            </div>
          </motion.div>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}
