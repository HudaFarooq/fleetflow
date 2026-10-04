"use client";

import { Bot, MapPinned, Route, Scale, ShieldCheck, Zap } from "lucide-react";
import { motion } from "motion/react";

import { Reveal } from "@/components/ui/reveal";

const FEATURES = [
  {
    icon: MapPinned,
    title: "Live tracking",
    text: "Every parcel gets a tracking ID and a step-by-step timeline your customers can open without logging in.",
    accent: "from-brand-400 to-brand-600",
  },
  {
    icon: Scale,
    title: "Smart dispatch",
    text: "Assign parcels to vehicles with built-in capacity checks, so no van is ever overloaded.",
    accent: "from-sky-400 to-sky-600",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    text: "Customers, dispatchers and drivers each see exactly what they need, and nothing they shouldn't.",
    accent: "from-violet-400 to-violet-600",
  },
  {
    icon: Zap,
    title: "EV-ready fleet",
    text: "Track battery levels alongside location, and see at a glance which electric vans need charging.",
    accent: "from-amber-400 to-amber-600",
  },
  {
    icon: Route,
    title: "Route optimization",
    text: "Plan the best order of stops for each vehicle to cut distance, time and energy.",
    accent: "from-rose-400 to-rose-600",
    soon: true,
  },
  {
    icon: Bot,
    title: "AI dispatch assistant",
    text: "Ask questions like \"Which vans are free near the depot?\" and get answers from live fleet data.",
    accent: "from-teal-400 to-cyan-600",
    soon: true,
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 bg-slate-50 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Features</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Everything between &ldquo;booked&rdquo; and &ldquo;delivered&rdquo;
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            One system for the people sending parcels, the team dispatching them, and the drivers on the road.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 0.06}>
              <motion.article
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group relative h-full overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition-shadow hover:shadow-xl hover:shadow-slate-200/80"
              >
                <div className={`absolute -right-10 -top-10 size-32 rounded-full bg-linear-to-br ${feature.accent} opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-20`} />
                <div className={`grid size-12 place-items-center rounded-2xl bg-linear-to-br ${feature.accent} text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6`}>
                  <feature.icon className="size-6" />
                </div>
                <h3 className="mt-6 flex items-center gap-2 text-lg font-semibold text-slate-900">
                  {feature.title}
                  {feature.soon && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      Coming soon
                    </span>
                  )}
                </h3>
                <p className="mt-2 leading-relaxed text-slate-600">{feature.text}</p>
              </motion.article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
