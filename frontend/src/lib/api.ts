import type {
  Analytics, CardInput, ChargingPlan, Parcel, Payment, Quote, RoutePlan, ParcelInput, ParcelStatus, PublicStats, PublicTracking, Role, User, UserInput, UserUpdate, Vehicle, VehicleInput,
} from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string | null;
  json?: unknown;
  form?: Record<string, string>;
};

async function request<T>(path: string, { method = "GET", token, json, form }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = new URLSearchParams(form);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method, headers, body });
  } catch {
    throw new ApiError(0, "Can't reach the FleetFlow server. Is the backend running?");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    // FastAPI returns a string for HTTPException and a list of issues for validation errors
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail) && data.detail[0]?.msg) {
      const issue = data.detail[0];
      const field = issue.loc?.at(-1);
      return field ? `${String(field).replace(/_/g, " ")}: ${issue.msg}` : issue.msg;
    }
  } catch {
    // fall through to the generic message
  }
  return `Request failed (${response.status})`;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/login", { method: "POST", form: { username: email, password } }),
  register: (data: { email: string; full_name: string; password: string }) =>
    request<User>("/auth/register", { method: "POST", json: data }),
  me: (token: string) => request<User>("/auth/me", { token }),
  updateMe: (token: string, data: { full_name?: string; email?: string }) =>
    request<User>("/auth/me", { method: "PATCH", token, json: data }),
  changePassword: (token: string, current_password: string, new_password: string) =>
    request<{ access_token: string }>("/auth/me/password", { method: "POST", token, json: { current_password, new_password } }),
  signOutEverywhere: (token: string) => request<void>("/auth/me/sign-out-everywhere", { method: "POST", token }),
  deleteMe: (token: string, password: string) =>
    request<{ result: "deleted" | "deactivated" }>("/auth/me", { method: "DELETE", token, json: { password } }),
  forgotPassword: (email: string) =>
    request<{ detail: string }>("/auth/forgot-password", { method: "POST", json: { email } }),
  resetPassword: (token: string, password: string) =>
    request<{ detail: string }>("/auth/reset-password", { method: "POST", json: { token, password } }),

  publicStats: () => request<PublicStats>("/stats/public"),
  track: (trackingId: string) => request<PublicTracking>(`/track/${encodeURIComponent(trackingId)}`),

  parcels: (token: string) => request<Parcel[]>("/parcels", { token }),
  createParcel: (token: string, data: ParcelInput) =>
    request<Parcel>("/parcels", { method: "POST", token, json: data }),
  assignParcel: (token: string, parcelId: number, vehicleId: number) =>
    request<Parcel>(`/parcels/${parcelId}/assign`, { method: "POST", token, json: { vehicle_id: vehicleId } }),
  updateParcelStatus: (token: string, parcelId: number, status: ParcelStatus, note?: string) =>
    request<Parcel>(`/parcels/${parcelId}/status`, { method: "POST", token, json: { status, note } }),

  vehicles: (token: string) => request<Vehicle[]>("/vehicles", { token }),
  createVehicle: (token: string, data: VehicleInput) =>
    request<Vehicle>("/vehicles", { method: "POST", token, json: data }),

  users: (token: string, role?: Role) => request<User[]>(`/users${role ? `?role=${role}` : ""}`, { token }),
  createUser: (token: string, data: UserInput) => request<User>("/users", { method: "POST", token, json: data }),
  updateUser: (token: string, userId: number, data: UserUpdate) =>
    request<User>(`/users/${userId}`, { method: "PATCH", token, json: data }),
  revokeSessions: (token: string, userId: number) =>
    request<User>(`/users/${userId}/revoke-sessions`, { method: "POST", token }),
  deleteUser: (token: string, userId: number) => request<void>(`/users/${userId}`, { method: "DELETE", token }),

  quote: (weightKg: number) => request<Quote>(`/pricing/quote?weight_kg=${weightKg}`),
  payParcel: (token: string, parcelId: number, card: CardInput) =>
    request<Payment>(`/parcels/${parcelId}/pay`, { method: "POST", token, json: card }),
  parcel: (token: string, parcelId: number) => request<Parcel>(`/parcels/${parcelId}`, { token }),
  payments: (token: string) => request<Payment[]>("/payments", { token }),
  refundPayment: (token: string, paymentId: number) =>
    request<Payment>(`/payments/${paymentId}/refund`, { method: "POST", token }),

  planRoutes: (token: string, apply = false) =>
    request<RoutePlan>("/planning/routes", { method: "POST", token, json: { apply } }),
  planCharging: (token: string, departureHour: number, siteLimitKw: number | null) =>
    request<ChargingPlan>("/planning/charging", {
      method: "POST",
      token,
      json: { departure_hour: departureHour, site_limit_kw: siteLimitKw },
    }),
  assistantStatus: (token: string) => request<{ configured: boolean; model: string | null }>("/assistant/status", { token }),
  assistantChat: (token: string, messages: { role: "user" | "assistant"; content: string }[]) =>
    request<{ reply: string; tools_used: string[]; remaining_today: number }>("/assistant/chat", {
      method: "POST",
      token,
      json: { messages },
    }),
  setSimulation: (token: string, running: boolean) =>
    request<{ running: boolean }>(`/simulation/${running ? "start" : "stop"}`, { method: "POST", token }),

  analytics: (token: string, days: number) => request<Analytics>(`/analytics?days=${days}`, { token }),
};
