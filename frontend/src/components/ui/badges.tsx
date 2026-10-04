import type { ParcelStatus, VehicleStatus } from "@/lib/types";
import { cn, PARCEL_STATUS, VEHICLE_STATUS } from "@/lib/utils";

const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset";

export function ParcelStatusBadge({ status }: { status: ParcelStatus }) {
  const meta = PARCEL_STATUS[status];
  return (
    <span className={cn(base, meta.badge)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const meta = VEHICLE_STATUS[status];
  return <span className={cn(base, meta.badge)}>{meta.label}</span>;
}

export function BatteryBar({ level }: { level: number | null }) {
  if (level === null) return <span className="text-xs text-slate-400">Fuel</span>;
  const color = level > 50 ? "bg-brand-500" : level > 20 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${level}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600">{Math.round(level)}%</span>
    </div>
  );
}
