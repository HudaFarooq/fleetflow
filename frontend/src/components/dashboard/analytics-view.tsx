"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Banknote, Clock, PackageCheck, Table2, Timer, Truck } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { DailyChart } from "@/components/dashboard/daily-chart";
import { ListSkeleton, Panel } from "@/components/dashboard/panels";
import { CountUp } from "@/components/ui/count-up";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Analytics } from "@/lib/types";
import { cn, formatMinutes, formatMoney, PARCEL_STATUS, VEHICLE_TYPE } from "@/lib/utils";

const RANGES = [7, 14, 30] as const;

export function AnalyticsView() {
  const { token } = useAuth();
  const [days, setDays] = useState<(typeof RANGES)[number]>(14);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["analytics", token, days],
    queryFn: () => api.analytics(token!, days),
    placeholderData: (previous) => previous, // keep the old charts on screen while a new range loads
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Analytics</h1>
          <p className="mt-1 text-slate-600">How deliveries are going across the fleet.</p>
        </div>
        <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200" role="tablist" aria-label="Time range">
          {RANGES.map((range) => (
            <button
              key={range}
              role="tab"
              aria-selected={days === range}
              onClick={() => setDays(range)}
              className={cn(
                "relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                days === range ? "text-white" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {days === range && (
                <motion.span layoutId="range" className="absolute inset-0 rounded-lg bg-ink-900" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
              )}
              <span className="relative">Last {range} days</span>
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error.message}</p>
      ) : isPending ? (
        <ListSkeleton rows={4} />
      ) : (
        <AnalyticsBody data={data} />
      )}
    </div>
  );
}

function AnalyticsBody({ data }: { data: Analytics }) {
  const [showTable, setShowTable] = useState(false);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi index={0} icon={Banknote} label={`Revenue (${data.days}d)`} hint="Payments taken, minus refunds">
          {formatMoney(data.revenue_cents, data.currency)}
        </Kpi>
        <Kpi index={1} icon={PackageCheck} label={`Delivered (${data.days}d)`}>
          <CountUp value={data.delivered} />
        </Kpi>
        <Kpi index={2} icon={BarChart3} label="Success rate" hint="Delivered out of all finished parcels">
          {data.success_rate === null ? "—" : <CountUp value={Math.round(data.success_rate)} suffix="%" />}
        </Kpi>
        <Kpi index={3} icon={Timer} label="Avg. delivery time" hint="From booking to doorstep">
          {formatMinutes(data.avg_delivery_minutes)}
        </Kpi>
        <Kpi index={4} icon={Truck} label="Out for delivery now" hint={`${data.waiting} waiting for dispatch`}>
          <CountUp value={data.in_progress} />
        </Kpi>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Deliveries per day"
          className="lg:col-span-2"
          action={
            <button
              onClick={() => setShowTable((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {showTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
              {showTable ? "Chart" : "Table"}
            </button>
          }
        >
          <div className="p-5">
            {showTable ? <DailyTable data={data} /> : <DailyChart data={data.daily} />}
          </div>
        </Panel>

        <Panel title={`Parcel status (${data.parcels_booked} booked)`}>
          <StatusBreakdown data={data} />
        </Panel>
      </div>

      <Panel title="Vehicle performance">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 font-medium">Vehicle</th>
                <th className="px-5 py-3 font-medium">Driver</th>
                <th className="px-5 py-3 text-right font-medium">Delivered</th>
                <th className="px-5 py-3 text-right font-medium">Failed</th>
                <th className="px-5 py-3 text-right font-medium">Success</th>
                <th className="px-5 py-3 text-right font-medium">Avg. time</th>
                <th className="px-5 py-3 font-medium">Current load</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.vehicles.map((vehicle, index) => {
                const loadShare = vehicle.capacity_kg ? Math.min(vehicle.load_kg / vehicle.capacity_kg, 1) : 0;
                return (
                  <motion.tr
                    key={vehicle.vehicle_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-mono font-semibold text-slate-900">{vehicle.plate_number}</p>
                      <p className="text-xs text-slate-500">{VEHICLE_TYPE[vehicle.type]}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">{vehicle.driver_name ?? <span className="text-slate-400">Unassigned</span>}</td>
                    <td className="px-5 py-3.5 text-right font-medium tabular-nums text-slate-900">{vehicle.delivered}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-slate-600">{vehicle.failed}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                      {vehicle.success_rate === null ? "—" : `${Math.round(vehicle.success_rate)}%`}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">{formatMinutes(vehicle.avg_delivery_minutes)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {/* Meter: same-hue track and fill */}
                        <div
                          className="h-2 w-28 overflow-hidden rounded-full bg-brand-100"
                          role="meter"
                          aria-valuemin={0}
                          aria-valuemax={vehicle.capacity_kg}
                          aria-valuenow={vehicle.load_kg}
                          aria-label={`${vehicle.plate_number} load`}
                        >
                          <motion.div
                            className="h-full rounded-full bg-brand-600"
                            initial={{ width: 0 }}
                            animate={{ width: `${loadShare * 100}%` }}
                            transition={{ duration: 0.8, delay: 0.2 + index * 0.05, ease: "easeOut" }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-slate-600">
                          {Math.round(vehicle.load_kg)}/{vehicle.capacity_kg} kg
                        </span>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Kpi({
  index,
  icon: Icon,
  label,
  hint,
  children,
}: {
  index: number;
  icon: typeof Clock;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className="size-4 text-slate-400" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{children}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </motion.div>
  );
}

function StatusBreakdown({ data }: { data: Analytics }) {
  const total = data.parcels_booked;
  return (
    <ul className="space-y-4 p-5">
      {data.statuses.map((item, index) => {
        const share = total ? item.count / total : 0;
        return (
          <li key={item.status}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-700">
                <span className={cn("size-2 rounded-full", PARCEL_STATUS[item.status].dot)} />
                {PARCEL_STATUS[item.status].label}
              </span>
              <span className="tabular-nums text-slate-900">
                <span className="font-medium">{item.count}</span>
                <span className="ml-1.5 text-xs text-slate-500">{Math.round(share * 100)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <motion.div
                className="h-full rounded-full bg-brand-600"
                initial={{ width: 0 }}
                animate={{ width: `${share * 100}%` }}
                transition={{ duration: 0.8, delay: 0.15 + index * 0.06, ease: "easeOut" }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DailyTable({ data }: { data: Analytics }) {
  return (
    <div className="max-h-60 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="py-2 text-left font-medium">Date</th>
            <th className="py-2 text-right font-medium">Booked</th>
            <th className="py-2 text-right font-medium">Delivered</th>
            <th className="py-2 text-right font-medium">Failed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {[...data.daily].reverse().map((day) => (
            <tr key={day.date}>
              <td className="py-2 text-slate-700">
                {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
              </td>
              <td className="py-2 text-right text-slate-600">{day.booked}</td>
              <td className="py-2 text-right font-medium text-slate-900">{day.delivered}</td>
              <td className="py-2 text-right text-slate-600">{day.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
