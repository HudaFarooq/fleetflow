import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { ParcelStatus, Role, VehicleStatus, VehicleType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// The happy path a parcel moves through, in order. "failed" can happen at any step.
export const PARCEL_STEPS: ParcelStatus[] = ["created", "assigned", "picked_up", "in_transit", "delivered"];

export const PARCEL_STATUS: Record<ParcelStatus, { label: string; badge: string; dot: string }> = {
  created: { label: "Booked", badge: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400" },
  assigned: { label: "Assigned", badge: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  picked_up: { label: "Picked up", badge: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  in_transit: { label: "In transit", badge: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  delivered: { label: "Delivered", badge: "bg-brand-50 text-brand-700 ring-brand-200", dot: "bg-brand-500" },
  failed: { label: "Failed", badge: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
};

export const VEHICLE_STATUS: Record<VehicleStatus, { label: string; badge: string; color: string }> = {
  available: { label: "Available", badge: "bg-brand-50 text-brand-700 ring-brand-200", color: "#10b981" },
  on_route: { label: "On route", badge: "bg-amber-50 text-amber-700 ring-amber-200", color: "#f59e0b" },
  charging: { label: "Charging", badge: "bg-sky-50 text-sky-700 ring-sky-200", color: "#0ea5e9" },
  maintenance: { label: "Maintenance", badge: "bg-rose-50 text-rose-700 ring-rose-200", color: "#f43f5e" },
};

export const VEHICLE_TYPE: Record<VehicleType, string> = {
  bike: "Bike",
  van: "Van",
  ev_van: "Electric van",
  truck: "Truck",
};

export function stepIndex(status: ParcelStatus): number {
  return PARCEL_STEPS.indexOf(status);
}

export function formatDateTime(iso: string): string {
  // The API stores UTC; SQLite drops the timezone, so treat zone-less values as UTC
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const ROLE: Record<Role, { label: string; badge: string }> = {
  admin: { label: "Admin", badge: "bg-violet-50 text-violet-700 ring-violet-200" },
  driver: { label: "Driver", badge: "bg-amber-50 text-amber-700 ring-amber-200" },
  customer: { label: "Customer", badge: "bg-sky-50 text-sky-700 ring-sky-200" },
};

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m`;
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}
