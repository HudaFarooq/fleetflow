"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, ClipboardList, Clock, Package, Pause, Play, Plus, Truck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { Modal } from "@/components/dashboard/modal";
import { EmptyState, ListSkeleton, Panel, StatCard } from "@/components/dashboard/panels";
import { useToast } from "@/components/dashboard/toast";
import { BatteryBar, ParcelStatusBadge, VehicleStatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFleetLive } from "@/lib/live";
import type { Parcel, ParcelStatus, User, Vehicle, VehicleInput, VehicleType } from "@/lib/types";
import { cn, formatDateTime, VEHICLE_TYPE } from "@/lib/utils";

// Leaflet touches `window`, so the map only renders in the browser
const FleetMap = dynamic(() => import("@/components/dashboard/fleet-map"), {
  ssr: false,
  loading: () => <div className="h-full min-h-80 animate-pulse bg-slate-100" />,
});

const ACTIVE: ParcelStatus[] = ["assigned", "picked_up", "in_transit"];

const FILTERS = [
  { id: "waiting", label: "Waiting", match: (p: Parcel) => p.status === "created" },
  { id: "active", label: "Active", match: (p: Parcel) => ACTIVE.includes(p.status) },
  { id: "done", label: "Completed", match: (p: Parcel) => p.status === "delivered" || p.status === "failed" },
  { id: "all", label: "All", match: () => true },
] as const;

export function AdminView() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("waiting");
  const [addingVehicle, setAddingVehicle] = useState(false);

  // Changes arrive over the WebSocket; the slow refetch is only a safety net
  const live = useFleetLive();
  const parcelsQuery = useQuery({ queryKey: ["parcels", token], queryFn: () => api.parcels(token!), refetchInterval: 60_000 });
  const vehiclesQuery = useQuery({ queryKey: ["vehicles", token], queryFn: () => api.vehicles(token!), refetchInterval: 60_000 });
  const driversQuery = useQuery({ queryKey: ["drivers", token], queryFn: () => api.users(token!, "driver") });

  const parcels = useMemo(() => parcelsQuery.data ?? [], [parcelsQuery.data]);
  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);

  // Weight currently loaded on each vehicle, used to show free capacity when assigning
  const loadByVehicle = useMemo(() => {
    const load = new Map<number, number>();
    for (const parcel of parcels) {
      if (parcel.vehicle_id !== null && ACTIVE.includes(parcel.status)) {
        load.set(parcel.vehicle_id, (load.get(parcel.vehicle_id) ?? 0) + parcel.weight_kg);
      }
    }
    return load;
  }, [parcels]);

  const visible = parcels.filter(FILTERS.find((item) => item.id === filter)!.match);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Dispatch</h1>
          <p className="mt-1 text-slate-600">Assign parcels and keep an eye on the fleet as it moves.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveBadge connected={live.connected} />
          <SimulationToggle running={live.simulation} />
          <Button variant="dark" onClick={() => setAddingVehicle(true)}>
            <Plus className="size-4" />
            Add vehicle
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard index={0} label="Waiting for dispatch" value={parcels.filter((p) => p.status === "created").length} icon={ClipboardList} accent="bg-slate-700" />
        <StatCard index={1} label="Out for delivery" value={parcels.filter((p) => ACTIVE.includes(p.status)).length} icon={Truck} accent="bg-amber-500" />
        <StatCard index={2} label="Delivered" value={parcels.filter((p) => p.status === "delivered").length} icon={CircleCheck} accent="bg-brand-500" />
        <StatCard index={3} label="Vehicles available" value={vehicles.filter((v) => v.status === "available").length} icon={Package} accent="bg-sky-500" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Live fleet map" className="overflow-hidden lg:col-span-2">
          <div className="h-96">
            <FleetMap vehicles={vehicles} />
          </div>
        </Panel>

        <Panel title={`Fleet (${vehicles.length})`}>
          {vehiclesQuery.isPending ? (
            <ListSkeleton />
          ) : vehicles.length === 0 ? (
            <EmptyState icon={Truck} title="No vehicles yet" text="Add your first vehicle to start dispatching." />
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {vehicles.map((vehicle) => (
                <li key={vehicle.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-900">{vehicle.plate_number}</p>
                    <p className="text-xs text-slate-500">
                      {VEHICLE_TYPE[vehicle.type]} · {Math.round(loadByVehicle.get(vehicle.id) ?? 0)}/{vehicle.capacity_kg} kg
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <VehicleStatusBadge status={vehicle.status} />
                    <BatteryBar level={vehicle.battery_level} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Parcels"
        action={
          <div className="flex rounded-xl bg-slate-100 p-1" role="tablist">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === item.id ? "text-slate-900" : "text-slate-500 hover:text-slate-700",
                )}
              >
                {filter === item.id && (
                  <motion.span
                    layoutId="parcel-filter"
                    className="absolute inset-0 rounded-lg bg-white shadow-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">{item.label}</span>
              </button>
            ))}
          </div>
        }
      >
        {parcelsQuery.isPending ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState icon={Package} title="Nothing here" text="No parcels match this filter right now." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">Parcel</th>
                  <th className="px-5 py-3 font-medium">Delivery</th>
                  <th className="px-5 py-3 font-medium">Weight</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Vehicle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <AnimatePresence initial={false} mode="popLayout">
                  {visible.map((parcel) => (
                    <motion.tr
                      key={parcel.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="align-middle"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-mono font-semibold text-slate-900">{parcel.tracking_id}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(parcel.created_at)}</p>
                      </td>
                      <td className="max-w-56 px-5 py-3.5">
                        <p className="text-slate-900">{parcel.receiver_name}</p>
                        <p className="truncate text-xs text-slate-500">{parcel.delivery_address}</p>
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-700">{parcel.weight_kg} kg</td>
                      <td className="px-5 py-3.5">
                        <ParcelStatusBadge status={parcel.status} />
                      </td>
                      <td className="px-5 py-3.5">
                        {!parcel.paid && parcel.status === "created" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                            <Clock className="size-3.5" />
                            Awaiting payment
                          </span>
                        ) : parcel.status === "created" || parcel.status === "assigned" ? (
                          <AssignControl parcel={parcel} vehicles={vehicles} loadByVehicle={loadByVehicle} />
                        ) : (
                          <span className="font-mono text-slate-700">
                            {vehicles.find((vehicle) => vehicle.id === parcel.vehicle_id)?.plate_number ?? "—"}
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <AddVehicleModal open={addingVehicle} onClose={() => setAddingVehicle(false)} drivers={driversQuery.data ?? []} />
    </div>
  );
}

function AssignControl({
  parcel,
  vehicles,
  loadByVehicle,
}: {
  parcel: Parcel;
  vehicles: Vehicle[];
  loadByVehicle: Map<number, number>;
}) {
  const { token } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState(parcel.vehicle_id?.toString() ?? "");

  const mutation = useMutation({
    mutationFn: () => api.assignParcel(token!, parcel.id, Number(vehicleId)),
    onSuccess: (updated) => {
      const plate = vehicles.find((vehicle) => vehicle.id === updated.vehicle_id)?.plate_number;
      toast(`${updated.tracking_id} assigned to ${plate}`);
      queryClient.invalidateQueries({ queryKey: ["parcels"] });
    },
    onError: (error) => toast(error.message, "error"),
  });

  const unchanged = vehicleId === (parcel.vehicle_id?.toString() ?? "");

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`assign-${parcel.id}`}>
        Vehicle for {parcel.tracking_id}
      </label>
      <select
        id={`assign-${parcel.id}`}
        value={vehicleId}
        onChange={(event) => setVehicleId(event.target.value)}
        className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        <option value="">Choose vehicle</option>
        {vehicles.map((vehicle) => {
          const ownWeight = parcel.vehicle_id === vehicle.id ? parcel.weight_kg : 0;
          const free = vehicle.capacity_kg - (loadByVehicle.get(vehicle.id) ?? 0) + ownWeight;
          const unavailable = vehicle.status === "maintenance" || free < parcel.weight_kg;
          return (
            <option key={vehicle.id} value={vehicle.id} disabled={unavailable}>
              {vehicle.plate_number} · {Math.round(free)} kg free{vehicle.status === "maintenance" ? " · maintenance" : ""}
            </option>
          );
        })}
      </select>
      <Button size="sm" disabled={!vehicleId || unchanged} loading={mutation.isPending} onClick={() => mutation.mutate()}>
        {parcel.status === "assigned" ? "Reassign" : "Assign"}
      </Button>
    </div>
  );
}

const VEHICLE_TYPES = Object.entries(VEHICLE_TYPE) as [VehicleType, string][];

function AddVehicleModal({ open, onClose, drivers }: { open: boolean; onClose: () => void; drivers: User[] }) {
  const { token } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ plate_number: "", type: "van" as VehicleType, capacity_kg: "500", battery_level: "100", driver_id: "" });

  const mutation = useMutation({
    mutationFn: (data: VehicleInput) => api.createVehicle(token!, data),
    onSuccess: (vehicle) => {
      toast(`Vehicle ${vehicle.plate_number} added`);
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setForm((current) => ({ ...current, plate_number: "" }));
      onClose();
    },
  });

  const isElectric = form.type === "ev_van";

  return (
    <Modal open={open} onClose={onClose} title="Add a vehicle">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({
            plate_number: form.plate_number,
            type: form.type,
            capacity_kg: Number(form.capacity_kg),
            battery_level: isElectric ? Number(form.battery_level) : null,
            driver_id: form.driver_id ? Number(form.driver_id) : null,
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Plate number"
            required
            maxLength={20}
            value={form.plate_number}
            onChange={(event) => setForm({ ...form, plate_number: event.target.value })}
          />
          <Select label="Type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as VehicleType })}>
            {VEHICLE_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            label="Capacity (kg)"
            type="number"
            required
            min={1}
            value={form.capacity_kg}
            onChange={(event) => setForm({ ...form, capacity_kg: event.target.value })}
          />
          {isElectric && (
            <Input
              label="Battery (%)"
              type="number"
              required
              min={0}
              max={100}
              value={form.battery_level}
              onChange={(event) => setForm({ ...form, battery_level: event.target.value })}
            />
          )}
        </div>
        <Select label="Driver" value={form.driver_id} onChange={(event) => setForm({ ...form, driver_id: event.target.value })}>
          <option value="">No driver yet</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.full_name}
            </option>
          ))}
        </Select>
        <FormError message={mutation.error?.message ?? null} />
        <Button type="submit" className="w-full" loading={mutation.isPending}>
          Add vehicle
        </Button>
      </form>
    </Modal>
  );
}

export function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium ring-1 ring-inset",
        connected ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-slate-100 text-slate-500 ring-slate-200",
      )}
      role="status"
    >
      <span className="relative flex size-2">
        {connected && <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-75" />}
        <span className={cn("relative inline-flex size-2 rounded-full", connected ? "bg-brand-500" : "bg-slate-400")} />
      </span>
      {connected ? "Live" : "Reconnecting…"}
    </span>
  );
}

function SimulationToggle({ running }: { running: boolean }) {
  const { token } = useAuth();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () => api.setSimulation(token!, !running),
    onSuccess: (state) => toast(state.running ? "Simulation started: vehicles are on the move" : "Simulation stopped"),
    onError: (error) => toast(error.message, "error"),
  });
  return (
    <Button variant="outline" loading={mutation.isPending} onClick={() => mutation.mutate()} title="Moves the demo fleet around the map">
      {running ? <Pause className="size-4" /> : <Play className="size-4" />}
      {running ? "Stop simulation" : "Simulate fleet"}
    </Button>
  );
}

