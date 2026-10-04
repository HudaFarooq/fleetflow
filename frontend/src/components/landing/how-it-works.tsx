"use client";

import { ClipboardList, PackageCheck, Truck, UserCheck } from "lucide-react";
import { motion } from "motion/react";

import { Reveal } from "@/components/ui/reveal";

const STEPS = [
  { icon: ClipboardList, title: "Book", text: "The customer books a parcel and instantly gets a tracking ID." },
  { icon: UserCheck, title: "Assign", text: "A dispatcher assigns it to a vehicle with enough free capacity." },
  { icon: Truck, title: "Pick up & move", text: "The driver picks it up and updates progress from the road." },
  { icon: PackageCheck, title: "Deliver", text: "Delivered. The full history stays on the tracking page." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-20 overflow-hidden bg-ink-950 py-24 text-white">
      <div className="bg-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">How it works</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Four steps, fully tracked</h2>
          <p className="mt-4 text-lg text-slate-400">
            Each step is recorded with a timestamp, so everyone sees the same story.
          </p>
        </Reveal>

        <div className="relative mt-20">
          {/* Connector line draws across as the section scrolls into view */}
          <div className="absolute left-0 right-0 top-8 hidden h-px bg-white/10 lg:block" />
          <motion.div
            className="absolute left-0 right-0 top-8 hidden h-px origin-left bg-linear-to-r from-brand-400 via-sky-glow to-brand-400 lg:block"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
          />

          <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <motion.li
                key={step.title}
                className="relative list-none text-center"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, delay: 0.2 + index * 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="relative mx-auto grid size-16 place-items-center rounded-2xl border border-white/10 bg-ink-800 shadow-lg shadow-brand-500/10">
                  <step.icon className="size-7 text-brand-300" />
                  <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-brand-500 text-xs font-semibold">
                    {index + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-slate-400">{step.text}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
