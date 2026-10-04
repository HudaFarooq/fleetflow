"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, CircleCheck, MapPin, PackageCheck, Truck, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { EmptyState, ListSkeleton, Panel, StatCard } from "@/components/dashboard/panels";
import { useToast } from "@/components/dashboard/toast";
import { BatteryBar, ParcelStatusBadge, VehicleStatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFleetLive } from "@/lib/live";
import type { Parcel, ParcelStatus } from "@/lib/types";
import { formatDateTime, PARCEL_STATUS, VEHICLE_TYPE } from "@/lib/utils";

// The one button a driver needs for each stage
const NEXT_ACTION: Partial<Record<ParcelStatus, { to: ParcelStatus; label: string }>> = {
  assigned: { to: "picked_up", label: "Mark picked up" },
  picked_up: { to: "in_transit", label: "Start delivery" },
  in_transit: { to: "delivered", label: "Mark delivered" },
};

export function DriverView() {
  const { token, user } = useAuth();
  useFleetLive(); // battery and status changes show up without refreshing
  const vehiclesQuery = useQuery({ queryKey: ["vehicles", token], queryFn: () => api.vehicles(token!) });
  const parcelsQuery = useQuery({ queryKey: ["parcels", token], queryFn: () => api.parcels(token!), refetchInterval: 15_000 });

  const parcels = parcelsQuery.data ?? [];
  const active = parcels.filter((parcel) => parcel.status in NEXT_ACTION);
  const completed = parcels.filter((parcel) => parcel.status === "delivered" || parcel.status === "failed");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Your deliveries</h1>
        <p className="mt-1 text-slate-600">Good to see you, {user?.full_name.split(" ")[0]}. Update each parcel as you go.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(vehiclesQuery.data ?? []).map((vehicle, index) => (
          <motion.div
            key={vehicle.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07 }}
            className="relative overflow-hidden rounded-2xl bg-ink-950 p-5 text-white"
          >
            <div className="absolute -right-8 -top-8 size-28 rounded-full bg-brand-500/30 blur-2xl" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Your vehicle</p>
                <p className="mt-1 font-mono text-xl font-semibold">{vehicle.plate_number}</p>
                <p className="text-sm text-slate-400">{VEHICLE_TYPE[vehicle.type]}</p>
              </div>
              <VehicleStatusBadge status={vehicle.status} />
            </div>
            <div className="relative mt-4 [&_span]:text-slate-300">
              <BatteryBar level={vehicle.battery_level} />
            </div>
          </motion.div>
        ))}
        <StatCard index={1} label="To deliver" value={active.length} icon={Truck} accent="bg-amber-500" />
        <StatCard index={2} label="Completed" value={completed.length} icon={PackageCheck} accent="bg-brand-500" />
      </div>

      <Panel title="Active deliveries">
        {parcelsQuery.isPending ? (
          <ListSkeleton />
        ) : active.length === 0 ? (
          <EmptyState icon={CircleCheck} title="All caught up" text="New deliveries appear here as soon as the dispatcher assigns them." />
        ) : (
          <ul className="grid gap-4 p-5 md:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {active.map((parcel) => (
                <DeliveryCard key={parcel.id} parcel={parcel} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Panel>

      {completed.length > 0 && (
        <Panel title="Completed">
          <ul className="divide-y divide-slate-100">
            {completed.map((parcel) => (
              <li key={parcel.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-slate-900">{parcel.tracking_id}</p>
                  <p className="truncate text-xs text-slate-500">{parcel.delivery_address}</p>
                </div>
                <ParcelStatusBadge status={parcel.status} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function DeliveryCard({ parcel }: { parcel: Parcel }) {
  const { token } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmingProblem, setConfirmingProblem] = useState(false);
  const next = NEXT_ACTION[parcel.status]!;

  const mutation = useMutation({
    mutationFn: (status: ParcelStatus) =>
      api.updateParcelStatus(token!, parcel.id, status, status === "failed" ? "Reported by driver" : undefined),
    onSuccess: (updated) => {
      toast(`${updated.tracking_id}: ${PARCEL_STATUS[updated.status].label}`, updated.status === "failed" ? "error" : "success");
      queryClient.invalidateQueries({ queryKey: ["parcels"] });
    },
    onError: (error) => toast(error.message, "error"),
  });

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className="flex flex-col rounded-2xl border border-slate-200 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono font-semibold text-slate-900">
            {parcel.stop_order && (
              <span className="rounded-md bg-ink-900 px-1.5 py-0.5 font-sans text-xs font-semibold text-white">Stop {parcel.stop_order}</span>
            )}
            {parcel.tracking_id}
          </p>
          <p className="text-xs text-slate-500">
            {parcel.weight_kg} kg · booked {formatDateTime(parcel.created_at)}
          </p>
        </div>
        <ParcelStatusBadge status={parcel.status} />
      </div>

      <div className="mt-4 space-y-1 text-sm">
        <p className="flex items-start gap-2 text-slate-600">
          <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
          {parcel.pickup_address}
        </p>
        <ArrowDown className="ml-0.5 size-3 text-slate-300" />
        <p className="flex items-start gap-2 font-medium text-slate-900">
          <MapPin className="mt-0.5 size-4 shrink-0 text-brand-500" />
          {parcel.delivery_address}
        </p>
        <p className="pl-6 text-xs text-slate-500">
          {parcel.receiver_name} · {parcel.receiver_phone}
        </p>
      </div>

      <div className="mt-5 flex gap-2">
        <Button className="flex-1" loading={mutation.isPending && mutation.variables === next.to} disabled={mutation.isPending} onClick={() => mutation.mutate(next.to)}>
          {next.label}
        </Button>
        {confirmingProblem ? (
          <Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate("failed")}>
            Confirm failed
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setConfirmingProblem(true)} aria-label="Report a problem">
            <TriangleAlert className="size-4" />
          </Button>
        )}
      </div>
    </motion.li>
  );
}
