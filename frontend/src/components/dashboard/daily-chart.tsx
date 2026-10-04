"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { DailyCount } from "@/lib/types";

// Single series, so one hue. Validated: passes contrast (>= 3:1) on the white surface.
const BAR = "#059669";
const HEIGHT = 240;
const PAD = { top: 24, right: 8, bottom: 28, left: 32 };

/** Top of the y-axis: four equal whole-number steps (1, 2 or 5 × 10ⁿ each) that fit the data. */
function niceMax(value: number) {
  const raw = Math.max(value, 1) / 4;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const fraction = raw / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  return Math.max(step, 1) * 4;
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Bars rounded only at the data end (top), anchored square on the baseline. */
function barPath(x: number, y: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

export function DailyChart({ data }: { data: DailyCount[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const max = niceMax(Math.max(...data.map((day) => day.delivered), 0));
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const plotWidth = Math.max(width - PAD.left - PAD.right, 0);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const band = data.length ? plotWidth / data.length : 0;
  const barWidth = Math.max(Math.min(band - 2, band * 0.62, 28), 2); // >= 2px gap between bars
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight;
  const labelEvery = data.length > 20 ? 5 : data.length > 10 ? 2 : 1;
  const peak = data.reduce((best, day, index) => (day.delivered > data[best].delivered ? index : best), 0);
  const total = data.reduce((sum, day) => sum + day.delivered, 0);

  const hovered = hover !== null ? data[hover] : null;
  const tooltipLeft = hover !== null ? PAD.left + band * hover + band / 2 : 0;

  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Deliveries per day over ${data.length} days, ${total} in total. Use the table view for exact values.`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill="#64748b">
                {tick}
              </text>
            </g>
          ))}

          {data.map((day, index) => {
            const x = PAD.left + band * index + (band - barWidth) / 2;
            const barHeight = (day.delivered / max) * plotHeight;
            const dimmed = hover !== null && hover !== index;
            return (
              <g key={day.date}>
                {day.delivered > 0 && (
                  <motion.path
                    d={barPath(x, y(day.delivered), barWidth, barHeight)}
                    fill={BAR}
                    initial={{ scaleY: 0, opacity: 0 }}
                    animate={{ scaleY: 1, opacity: dimmed ? 0.35 : 1 }}
                    transition={{ scaleY: { duration: 0.6, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.15 } }}
                    style={{ transformOrigin: `0px ${PAD.top + plotHeight}px` }}
                  />
                )}
                {/* Direct label on the busiest day only */}
                {index === peak && day.delivered > 0 && (
                  <text x={x + barWidth / 2} y={y(day.delivered) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0f172a">
                    {day.delivered}
                  </text>
                )}
                {index % labelEvery === (data.length - 1) % labelEvery && (
                  <text x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="#64748b">
                    {shortDate(day.date)}
                  </text>
                )}
                {/* Hit target: the full column, much bigger than the bar */}
                <rect
                  x={PAD.left + band * index}
                  y={PAD.top}
                  width={band}
                  height={plotHeight}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${shortDate(day.date)}: ${day.delivered} delivered, ${day.failed} failed, ${day.booked} booked`}
                  onMouseEnter={() => setHover(index)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  className="cursor-default outline-none"
                />
              </g>
            );
          })}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeWidth={1} />
        </svg>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-40 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(tooltipLeft, 80), width - 80) }}
        >
          <p className="font-semibold text-slate-900">{shortDate(hovered.date)}</p>
          <dl className="mt-1.5 space-y-1 text-slate-600">
            <div className="flex justify-between">
              <dt className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: BAR }} />
                Delivered
              </dt>
              <dd className="font-medium tabular-nums text-slate-900">{hovered.delivered}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Failed</dt>
              <dd className="tabular-nums">{hovered.failed}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Booked</dt>
              <dd className="tabular-nums">{hovered.booked}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
