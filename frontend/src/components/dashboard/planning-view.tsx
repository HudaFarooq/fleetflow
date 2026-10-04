"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BatteryCharging, CircleAlert, Route, Sparkles, Table2, BarChart3 } from "lucide-react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { ChargingChart, slotLabel } from "@/components/dashboard/charging-chart";
import { Panel } from "@/components/dashboard/panels";
import { useToast } from "@/components/dashboard/toast";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ChargingPlan, RoutePlan } from "@/lib/types";
import { cn, formatMoney, VEHICLE_TYPE } from "@/lib/utils";

// Categorical palette in fixed order, validated for colour-vision deficiency.
// Colour follows the vehicle (routes are always listed in vehicle order), and every route
// also carries a direct plate label, so identity never depends on colour alone.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

const RouteMap = dynamic(() => import("@/components/dashboard/route-map"), {
  ssr: false,
  loading: () => <div className="h-full min-h-96 animate-pulse bg-slate-100" />,
});

export function PlanningView() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Planning</h1>
        <p className="mt-1 max-w-2xl text-slate-600">
          Optimization tools for the dispatcher: who delivers what in which order, and when each electric van should charge.
        </p>
      </div>
      <RoutePlanner />
      <ChargingPlanner />
    </div>
  );
}

function Kpi({ label, value, hint, index }: { label: string; value: string; hint?: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </motion.div>
  );
}

function SectionHeader({ icon: Icon, title, text, children }: { icon: typeof Route; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-ink-950 text-brand-300">
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="max-w-xl text-sm text-slate-600">{text}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">{children}</div>
    </div>
  );
}

// --- Routes ---

function RoutePlanner() {
  const { token } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<RoutePlan | null>(null);

  const preview = useMutation({ mutationFn: () => api.planRoutes(token!, false), onSuccess: setPlan });
  const apply = useMutation({
    mutationFn: () => api.planRoutes(token!, true),
    onSuccess: (applied) => {
      setPlan(applied);
      const assigned = applied.routes.flatMap((route) => route.stops).filter((stop) => stop.new).length;
      toast(`Plan applied: ${assigned} parcel${assigned === 1 ? "" : "s"} assigned and every stop order updated`);
      queryClient.invalidateQueries({ queryKey: ["parcels"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (error) => toast(error.message, "error"),
  });

  const newStops = plan ? plan.routes.flatMap((route) => route.stops).filter((stop) => stop.new).length : 0;

  return (
    <section className="space-y-5">
      <SectionHeader
        icon={Route}
        title="Route optimizer"
        text="Assigns waiting parcels to vehicles and orders every stop to minimize driving, within each vehicle's weight capacity and each EV's battery range."
      >
        <Button onClick={() => preview.mutate()} loading={preview.isPending}>
          <Sparkles className="size-4" />
          {plan ? "Re-optimize" : "Optimize routes"}
        </Button>
        {plan && !plan.applied && newStops > 0 && (
          <Button variant="dark" onClick={() => apply.mutate()} loading={apply.isPending}>
            Apply plan
          </Button>
        )}
      </SectionHeader>
      <FormError message={preview.error?.message ?? null} />

      {plan && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi index={0} label="Planned distance" value={`${plan.total_km.toFixed(1)} km`} hint="All vehicles, open routes" />
            <Kpi index={1} label="In booking order" value={`${plan.booking_order_km.toFixed(1)} km`} hint="Same parcels, no re-ordering" />
            <Kpi index={2} label="Distance saved" value={`${plan.saving_pct.toFixed(0)}%`} hint={`${(plan.booking_order_km - plan.total_km).toFixed(1)} km less driving`} />
            <Kpi index={3} label="New assignments" value={String(newStops)} hint={plan.applied ? "Applied" : "Preview only, nothing changed yet"} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Panel title="Planned routes" className="overflow-hidden">
              <div className="h-[28rem]">
                <RouteMap routes={plan.routes} colors={SERIES} />
              </div>
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                Numbered circles are stops in order. Hollow = newly assigned by this plan; solid = already on the vehicle.
                Distances are straight-line distance × a typical road detour factor, so treat them as estimates.
              </p>
            </Panel>

            <Panel title="Vehicles">
              <ul className="divide-y divide-slate-100">
                {plan.routes.map((route, index) => (
                  <li key={route.vehicle_id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1 w-6 rounded-full" style={{ background: SERIES[index % SERIES.length] }} />
                        <span className="font-mono font-semibold text-slate-900">{route.plate_number}</span>
                        <span className="text-xs text-slate-500">{VEHICLE_TYPE[route.type]}</span>
                      </span>
                      <span className="text-sm tabular-nums text-slate-700">
                        {route.stops.length} stop{route.stops.length === 1 ? "" : "s"} · {route.distance_km.toFixed(1)} km
                      </span>
                    </div>
                    <Meter label="Load" value={route.load_kg} max={route.capacity_kg} unit="kg" />
                    {route.energy_kwh !== null && route.range_km !== null && (
                      <Meter label="Range used" value={route.distance_km} max={Math.max(route.range_km, 0.1)} unit="km" />
                    )}
                  </li>
                ))}
              </ul>
              {plan.unplanned.length > 0 && (
                <div className="border-t border-slate-100 px-5 py-4">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700">
                    <CircleAlert className="size-4" />
                    {plan.unplanned.length} parcel{plan.unplanned.length === 1 ? "" : "s"} not planned
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {plan.unplanned.map((item) => (
                      <li key={item.parcel_id}>
                        <span className="font-mono">{item.tracking_id}</span>: {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}

function Meter({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const share = Math.min(value / max, 1);
  return (
    <div className="mt-2.5 flex items-center gap-3 text-xs">
      <span className="w-20 text-slate-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-100" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <motion.div className="h-full rounded-full bg-brand-600" initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.7 }} />
      </div>
      <span className="w-24 text-right tabular-nums text-slate-600">
        {value.toFixed(1)} / {max.toFixed(0)} {unit}
      </span>
    </div>
  );
}

// --- Charging ---

function ChargingPlanner() {
  const { token } = useAuth();
  const [departure, setDeparture] = useState(8);
  const [siteLimit, setSiteLimit] = useState("");
  const [mode, setMode] = useState<"optimized" | "baseline">("optimized");
  const [showTable, setShowTable] = useState(false);
  const [plan, setPlan] = useState<ChargingPlan | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.planCharging(token!, departure, siteLimit ? Number(siteLimit) : null),
    onSuccess: setPlan,
  });

  const peak = (rows: number[][]) => (rows.length ? Math.max(...rows[0].map((_, t) => rows.reduce((sum, row) => sum + row[t], 0))) : 0);

  return (
    <section className="space-y-5">
      <SectionHeader
        icon={BatteryCharging}
        title="EV charging planner"
        text="Schedules overnight charging for the cheapest electricity, without exceeding the depot's grid connection, so every electric van has enough charge for its planned route."
      >
        <Select label="Ready by" value={departure} onChange={(e) => setDeparture(Number(e.target.value))} className="w-32">
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>
              {String(hour).padStart(2, "0")}:00
            </option>
          ))}
        </Select>
        <Input label="Site limit (kW)" type="number" min={1} placeholder="22" value={siteLimit} onChange={(e) => setSiteLimit(e.target.value)} className="w-36" />
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
          <Sparkles className="size-4" />
          Plan charging
        </Button>
      </SectionHeader>
      <FormError message={mutation.error?.message ?? null} />

      {plan && plan.vehicles.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">No electric vans with a known location and battery level to plan for.</p>
      )}

      {plan && plan.vehicles.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi index={0} label="Optimized cost" value={formatMoney(plan.cost_cents, plan.currency)} hint={`${plan.vehicles.reduce((s, v) => s + v.energy_kwh, 0).toFixed(1)} kWh from the grid`} />
            <Kpi index={1} label="If charged immediately" value={formatMoney(plan.baseline_cost_cents, plan.currency)} hint="Plug in and charge flat out" />
            <Kpi index={2} label="Saved" value={`${plan.saving_pct.toFixed(0)}%`} hint={formatMoney(plan.baseline_cost_cents - plan.cost_cents, plan.currency) + " tonight"} />
            <Kpi
              index={3}
              label="Peak site load"
              value={`${peak(plan.vehicles.map((v) => v.power_kw)).toFixed(1)} kW`}
              hint={`Limit ${plan.site_limit_kw} kW · ready by ${slotLabel(plan.departure, plan.timezone)} (${plan.timezone})`}
            />
          </div>

          <Panel
            title="Charging schedule"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Schedule to show">
                  {(["optimized", "baseline"] as const).map((option) => (
                    <button
                      key={option}
                      role="tab"
                      aria-selected={mode === option}
                      onClick={() => setMode(option)}
                      className={cn("relative rounded-lg px-3 py-1 text-sm font-medium", mode === option ? "text-slate-900" : "text-slate-500")}
                    >
                      {mode === option && <motion.span layoutId="charge-mode" className="absolute inset-0 rounded-lg bg-white shadow-sm" />}
                      <span className="relative">{option === "optimized" ? "Optimized" : "Charge immediately"}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowTable((value) => !value)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                >
                  {showTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
                  {showTable ? "Chart" : "Table"}
                </button>
              </div>
            }
          >
            <div className="p-5">
              {/* Legend: always present for two or more series */}
              <div className="mb-3 flex flex-wrap gap-4 text-sm text-slate-700">
                {plan.vehicles.map((vehicle, i) => (
                  <span key={vehicle.vehicle_id} className="flex items-center gap-1.5">
                    <span className="size-3 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
                    {vehicle.plate_number}
                  </span>
                ))}
              </div>
              {showTable ? <ChargingTable plan={plan} mode={mode} /> : <ChargingChart plan={plan} colors={SERIES} mode={mode} />}
            </div>
          </Panel>

          <Panel title="Electric vans">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 font-medium">Van</th>
                    <th className="px-5 py-3 text-right font-medium">Planned day</th>
                    <th className="px-5 py-3 text-right font-medium">Battery now</th>
                    <th className="px-5 py-3 text-right font-medium">Needs</th>
                    <th className="px-5 py-3 text-right font-medium">At departure</th>
                    <th className="px-5 py-3 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {plan.vehicles.map((vehicle) => (
                    <tr key={vehicle.vehicle_id}>
                      <td className="px-5 py-3.5 font-mono font-semibold text-slate-900">{vehicle.plate_number}</td>
                      <td className="px-5 py-3.5 text-right text-slate-700">{vehicle.planned_km} km</td>
                      <td className="px-5 py-3.5 text-right text-slate-700">{vehicle.battery_now_pct}%</td>
                      <td className="px-5 py-3.5 text-right text-slate-700">{vehicle.target_pct}%</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={vehicle.shortfall_kwh > 0 ? "font-medium text-rose-600" : "font-medium text-slate-900"}>{vehicle.final_pct}%</span>
                        {vehicle.shortfall_kwh > 0 && <span className="block text-xs text-rose-600">{vehicle.shortfall_kwh.toFixed(1)} kWh short</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-900">{formatMoney(vehicle.cost_cents, plan.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </section>
  );
}

function ChargingTable({ plan, mode }: { plan: ChargingPlan; mode: "optimized" | "baseline" }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="py-2 text-left font-medium">Slot</th>
            <th className="py-2 text-right font-medium">Price</th>
            {plan.vehicles.map((vehicle) => (
              <th key={vehicle.vehicle_id} className="py-2 text-right font-medium">{vehicle.plate_number}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {plan.slots.map((slot, t) => (
            <tr key={slot.start}>
              <td className="py-1.5 text-slate-700">{slotLabel(slot.start, plan.timezone)}</td>
              <td className="py-1.5 text-right text-slate-600">{slot.price_cents}¢</td>
              {plan.vehicles.map((vehicle) => (
                <td key={vehicle.vehicle_id} className="py-1.5 text-right text-slate-900">
                  {(mode === "optimized" ? vehicle.power_kw : vehicle.baseline_power_kw)[t].toFixed(1)} kW
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
