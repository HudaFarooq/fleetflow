"use client";

import { AdminView } from "@/components/dashboard/admin-view";
import { CustomerView } from "@/components/dashboard/customer-view";
import { DriverView } from "@/components/dashboard/driver-view";
import { useAuth } from "@/lib/auth";

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null; // the layout handles loading and redirects

  if (user.role === "admin") return <AdminView />;
  if (user.role === "driver") return <DriverView />;
  return <CustomerView />;
}
