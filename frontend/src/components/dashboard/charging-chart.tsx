"use client";

import { useEffect, useRef, useState } from "react";

import type { ChargingPlan } from "@/lib/types";

const HEIGHT = 230;
const PRICE_HEIGHT = 90;
const PAD = { top: 20, right: 12, bottom: 26, left: 40 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function slotLabel(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone });
}

/**
 * Stacked columns: charging power per EV in each slot, with the site's grid limit as a dashed rule.
 * Below it, on its own axis, the electricity price, so the reader can see charging move to cheap hours.
 */
export function ChargingChart({ plan, colors, mode }: { plan: ChargingPlan; colors: string[]; mode: "optimized" | "baseline" }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const series = plan.vehicles.map((v) => (mode === "optimized" ? v.power_kw : v.baseline_power_kw));
  const n = plan.slots.length;
  const totals = plan.slots.map((_, t) => series.reduce((sum, row) => sum + row[t], 0));
  const max = Math.ceil(Math.max(plan.site_limit_kw, ...totals) / 5) * 5 + 5;
  const plotWidth = Math.max(width - PAD.left - PAD.right, 0);
  const band = n ? plotWidth / n : 0;
  const barWidth = Math.max(band - 2, 1); // 2px gap between columns
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const y = (kw: number) => PAD.top + plotHeight - (kw / max) * plotHeight;
  const ticks = [0, max / 2, max].map((tick) => Math.round(tick));
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  const prices = plan.slots.map((slot) => slot.price_cents);
  const maxPrice = Math.max(...prices, 1) * 1.15;
  const priceY = (price: number) => 8 + (PRICE_HEIGHT - 26) * (1 - price / maxPrice);
  const pricePath = plan.slots
    .map((slot, t) => `${t === 0 ? "M" : "L"}${PAD.left + band * t},${priceY(slot.price_cents)} H${PAD.left + band * (t + 1)}`)
    .join(" ");


  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <>
          <svg width={width} height={HEIGHT} role="img" aria-label={`Charging power per vehicle in each ${plan.slot_minutes}-minute slot (${mode === "optimized" ? "optimized plan" : "charging immediately"}). The table view has exact values.`}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" />
                <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill="#64748b">{tick} kW</text>
              </g>
            ))}
            {plan.slots.map((slot, t) => {
              let base = 0;
              const x = PAD.left + band * t + (band - barWidth) / 2;
              return (
                <g key={slot.start} opacity={hover === null || hover === t ? 1 : 0.45}>
                  {series.map((row, i) => {
                    const kw = row[t];
                    if (kw < 0.01) return null;
                    const top = y(base + kw);
                    const height = y(base) - top;
                    base += kw;
                    // 1px surface gap between stacked segments
                    return <rect key={i} x={x} y={top + 1} width={barWidth} height={Math.max(height - 1, 0.5)} rx={1.5} fill={colors[i % colors.length]} />;
                  })}
                  {t % labelEvery === 0 && (
                    <text x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="#64748b">
                      {slotLabel(slot.start, plan.timezone)}
                    </text>
                  )}
                  <rect
                    x={PAD.left + band * t} y={PAD.top} width={band} height={plotHeight} fill="transparent"
                    tabIndex={0} className="outline-none"
                    aria-label={`${slotLabel(slot.start, plan.timezone)}: ${totals[t].toFixed(1)} kW at ${slot.price_cents} cents per kWh`}
                    onMouseEnter={() => setHover(t)} onFocus={() => setHover(t)} onBlur={() => setHover(null)}
                  />
                </g>
              );
            })}
            <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="#94a3b8" />
            {/* Site limit: dashed reference rule with a direct label */}
            <line x1={PAD.left} x2={width - PAD.right} y1={y(plan.site_limit_kw)} y2={y(plan.site_limit_kw)} stroke="#0f172a" strokeDasharray="5 4" />
            <text x={width - PAD.right} y={y(plan.site_limit_kw) - 6} textAnchor="end" fontSize={11} fontWeight={600} fill="#0f172a">
              Site limit {plan.site_limit_kw} kW
            </text>
          </svg>

          <svg width={width} height={PRICE_HEIGHT} role="img" aria-label="Electricity price for each slot">
            <text x={PAD.left - 8} y={priceY(maxPrice / 1.15)} dy="0.32em" textAnchor="end" fontSize={11} fill="#64748b">
              {Math.round(maxPrice / 1.15)}¢
            </text>
            <text x={PAD.left - 8} y={priceY(0)} dy="0.32em" textAnchor="end" fontSize={11} fill="#64748b">0¢</text>
            <line x1={PAD.left} x2={width - PAD.right} y1={priceY(0)} y2={priceY(0)} stroke="#94a3b8" />
            <path d={pricePath} fill="none" stroke="#475569" strokeWidth={2} />
            {hover !== null && (
              <circle cx={PAD.left + band * hover + band / 2} cy={priceY(prices[hover])} r={4} fill="#475569" stroke="white" strokeWidth={2} />
            )}
            <text x={PAD.left} y={PRICE_HEIGHT - 4} fontSize={11} fill="#64748b">Electricity price per kWh</text>
          </svg>
        </>
      )}

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-48 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(PAD.left + band * hover + band / 2, 100), width - 100) }}
        >
          <p className="font-semibold text-slate-900">
            {slotLabel(plan.slots[hover].start, plan.timezone)} · {plan.slots[hover].price_cents}¢/kWh
          </p>
          <dl className="mt-1.5 space-y-1 text-slate-600">
            {plan.vehicles.map((vehicle, i) => (
              <div key={vehicle.vehicle_id} className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: colors[i % colors.length] }} />
                  {vehicle.plate_number}
                </dt>
                <dd className="tabular-nums text-slate-900">{series[i][hover].toFixed(1)} kW</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-1 font-medium text-slate-900">
              <dt>Total</dt>
              <dd className="tabular-nums">{totals[hover].toFixed(1)} kW</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
