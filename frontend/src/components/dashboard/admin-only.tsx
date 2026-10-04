"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";

/**
 * Renders its children only for admins and sends everyone else back to their own dashboard.
 * The API enforces this too, so this is a friendly redirect, not the security boundary.
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (user && !isAdmin) router.replace("/dashboard");
  }, [user, isAdmin, router]);

  return isAdmin ? children : null;
}
