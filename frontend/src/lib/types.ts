// Mirrors the response models in backend/app/schemas.py

export type Role = "customer" | "admin" | "driver";
export type VehicleType = "bike" | "van" | "ev_van" | "truck";
export type VehicleStatus = "available" | "on_route" | "charging" | "maintenance";
export type ParcelStatus = "created" | "assigned" | "picked_up" | "in_transit" | "delivered" | "failed";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface UserInput {
  full_name: string;
  email: string;
  role: Role;
  password: string;
}

export type UserUpdate = Partial<UserInput & { is_active: boolean }>;

export interface Vehicle {
  id: number;
  plate_number: string;
  type: VehicleType;
  capacity_kg: number;
  battery_level: number | null;
  status: VehicleStatus;
  latitude: number | null;
  longitude: number | null;
  driver_id: number | null;
}

export interface TrackingEvent {
  status: ParcelStatus;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface Parcel {
  id: number;
  tracking_id: string;
  receiver_name: string;
  receiver_phone: string;
  pickup_address: string;
  delivery_address: string;
  weight_kg: number;
  status: ParcelStatus;
  vehicle_id: number | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  stop_order: number | null;
  price_cents: number;
  currency: string;
  paid: boolean;
  created_at: string;
  events: TrackingEvent[];
}

export interface PublicTracking {
  tracking_id: string;
  status: ParcelStatus;
  delivery_address: string;
  created_at: string;
  events: TrackingEvent[];
}

export interface PublicStats {
  parcels_total: number;
  parcels_delivered: number;
  parcels_in_progress: number;
  vehicles_total: number;
  electric_share: number;
}

export interface ParcelInput {
  receiver_name: string;
  receiver_phone: string;
  pickup_address: string;
  delivery_address: string;
  weight_kg: number;
  delivery_latitude?: number;
  delivery_longitude?: number;
}

export interface VehicleInput {
  plate_number: string;
  type: VehicleType;
  capacity_kg: number;
  battery_level?: number | null;
  driver_id?: number | null;
}

export interface DailyCount {
  date: string;
  booked: number;
  delivered: number;
  failed: number;
}

export interface VehiclePerformance {
  vehicle_id: number;
  plate_number: string;
  type: VehicleType;
  driver_name: string | null;
  delivered: number;
  failed: number;
  success_rate: number | null;
  avg_delivery_minutes: number | null;
  load_kg: number;
  capacity_kg: number;
}

export interface Analytics {
  days: number;
  parcels_booked: number;
  delivered: number;
  failed: number;
  in_progress: number;
  waiting: number;
  success_rate: number | null;
  avg_delivery_minutes: number | null;
  revenue_cents: number;
  currency: string;
  daily: DailyCount[];
  statuses: { status: ParcelStatus; count: number }[];
  vehicles: VehiclePerformance[];
}

export type PaymentStatus = "succeeded" | "failed" | "refunded";

export interface Payment {
  id: number;
  parcel_id: number;
  tracking_id: string;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  card_brand: string | null;
  card_last4: string | null;
  failure_reason: string | null;
  created_at: string;
  refunded_at: string | null;
  refundable: boolean;
}

export interface Quote {
  weight_kg: number;
  amount_cents: number;
  currency: string;
}

export interface CardInput {
  number: string;
  exp_month: number;
  exp_year: number;
  cvc: string;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface PlannedRoute {
  vehicle_id: number;
  plate_number: string;
  type: VehicleType;
  start: LatLng;
  stops: (LatLng & { parcel_id: number; tracking_id: string; weight_kg: number; new: boolean })[];
  distance_km: number;
  booking_order_km: number;
  load_kg: number;
  capacity_kg: number;
  energy_kwh: number | null;
  range_km: number | null;
}

export interface RoutePlan {
  routes: PlannedRoute[];
  unplanned: { parcel_id: number; tracking_id: string; reason: string }[];
  total_km: number;
  booking_order_km: number;
  saving_pct: number;
  applied: boolean;
}

export interface EVChargingPlan {
  vehicle_id: number;
  plate_number: string;
  battery_now_pct: number;
  target_pct: number;
  final_pct: number;
  planned_km: number;
  energy_kwh: number;
  cost_cents: number;
  shortfall_kwh: number;
  power_kw: number[];
  baseline_power_kw: number[];
}

export interface ChargingPlan {
  slots: { start: string; price_cents: number }[];
  slot_minutes: number;
  departure: string;
  timezone: string;
  site_limit_kw: number;
  charger_kw: number;
  vehicles: EVChargingPlan[];
  cost_cents: number;
  baseline_cost_cents: number;
  saving_pct: number;
  currency: string;
}
