"use client";

import { BatteryCharging, PackageCheck, Route } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

// One delivery route drawn in the SVG's own coordinate space (420 x 340)
const ROUTE = "M50 280 C 100 220, 130 250, 170 200 S 240 110, 290 140 S 360 100, 380 60";
const STOPS = [
  { x: 50, y: 280, label: "Depot" },
  { x: 170, y: 200, label: "Stop 1" },
  { x: 290, y: 140, label: "Stop 2" },
  { x: 380, y: 60, label: "Stop 3" },
];
// Faint background streets
const STREETS = [
  "M0 90 H420", "M0 180 H420", "M0 260 H420", "M80 0 V340", "M210 0 V340", "M330 0 V340",
  "M0 330 L420 20",
];

export function HeroVisual() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mx-auto w-full max-w-xl">
      {/* Glow behind the card */}
      <div className="absolute -inset-6 rounded-[2.5rem] bg-linear-to-tr from-brand-500/25 via-sky-glow/10 to-transparent blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 30, rotateX: 12 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900/80 p-4 shadow-2xl shadow-black/50 backdrop-blur"
        style={{ transformPerspective: 1200 }}
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-brand-400" />
            </span>
            Live fleet view
          </div>
          <span className="font-mono text-[11px] text-slate-500">Route FF-202</span>
        </div>

        <svg viewBox="0 0 420 340" className="w-full rounded-2xl bg-ink-950/70" role="img" aria-label="Animated delivery route with a vehicle moving between stops">
          <defs>
            <linearGradient id="route-gradient" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>

          {STREETS.map((d) => (
            <path key={d} d={d} stroke="white" strokeOpacity={0.06} strokeWidth={10} fill="none" />
          ))}

          {/* Route draws itself in, then stays */}
          <motion.path
            d={ROUTE}
            fill="none"
            stroke="url(#route-gradient)"
            strokeWidth={4}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.8, delay: 0.8, ease: "easeInOut" }}
          />
          <path d={ROUTE} fill="none" stroke="white" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 8" />

          {STOPS.map((stop, index) => (
            <motion.g
              key={stop.label}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1 + index * 0.35, type: "spring", stiffness: 300, damping: 18 }}
              style={{ transformOrigin: `${stop.x}px ${stop.y}px` }}
            >
              <circle cx={stop.x} cy={stop.y} r={11} fill="#10b981" fillOpacity={0.15} />
              <circle cx={stop.x} cy={stop.y} r={5} fill={index === 0 ? "#38bdf8" : "#10b981"} stroke="#060914" strokeWidth={2} />
              <text
                x={index === STOPS.length - 1 ? stop.x - 12 : stop.x + 12}
                y={stop.y - 10}
                textAnchor={index === STOPS.length - 1 ? "end" : "start"}
                fill="#94a3b8"
                fontSize={11}
                fontFamily="inherit"
              >
                {stop.label}
              </text>
            </motion.g>
          ))}

          {/* Vehicle following the route */}
          <g>
            <circle r={14} fill="#10b981" fillOpacity={0.2}>
              {!reduceMotion && <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite" />}
            </circle>
            <circle r={7} fill="white" stroke="#10b981" strokeWidth={3} />
            {reduceMotion ? null : (
              <animateMotion dur="9s" begin="2.6s" repeatCount="indefinite" path={ROUTE} keyPoints="0;1" keyTimes="0;1" calcMode="linear" fill="freeze" />
            )}
            {reduceMotion && <animateMotion dur="0.01s" path={ROUTE} keyPoints="0.55;0.55" keyTimes="0;1" fill="freeze" />}
          </g>
        </svg>
      </motion.div>

      <FloatingCard className="-left-4 top-24 sm:-left-12" delay={1.4} float={-8}>
        <span className="grid size-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
          <PackageCheck className="size-5" />
        </span>
        <div>
          <p className="text-xs text-slate-400">Parcel FF7K2M…</p>
          <p className="text-sm font-medium text-white">In transit</p>
        </div>
      </FloatingCard>

      <FloatingCard className="-right-3 top-6 sm:-right-10" delay={1.7} float={8}>
        <span className="grid size-9 place-items-center rounded-xl bg-sky-glow/15 text-sky-300">
          <BatteryCharging className="size-5" />
        </span>
        <div>
          <p className="text-xs text-slate-400">EV van FF-202</p>
          <p className="text-sm font-medium text-white">Battery 82%</p>
        </div>
      </FloatingCard>

      <FloatingCard className="-bottom-5 right-8" delay={2} float={-6}>
        <span className="grid size-9 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
          <Route className="size-5" />
        </span>
        <div>
          <p className="text-xs text-slate-400">Today&apos;s route</p>
          <p className="text-sm font-medium text-white">3 stops planned</p>
        </div>
      </FloatingCard>
    </div>
  );
}

function FloatingCard({
  className,
  delay,
  float,
  children,
}: {
  className: string;
  delay: number;
  float: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, y: [0, float, 0] }}
      transition={{
        opacity: { delay, duration: 0.4 },
        scale: { delay, type: "spring", stiffness: 260, damping: 20 },
        y: { delay: delay + 0.4, duration: 4, repeat: Infinity, ease: "easeInOut" },
      }}
      className={`absolute z-10 hidden items-center gap-3 rounded-2xl border border-white/10 bg-ink-800/90 px-3.5 py-2.5 shadow-xl backdrop-blur sm:flex ${className}`}
    >
      {children}
    </motion.div>
  );
}
