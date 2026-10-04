"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { AssistantPanel } from "@/components/dashboard/assistant-panel";
import { ToastProvider } from "@/components/dashboard/toast";
import { Logo } from "@/components/ui/logo";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { cn, initials, ROLE } from "@/lib/utils";

const NAV: Record<Role, { href: string; label: string }[]> = {
  admin: [
    { href: "/dashboard", label: "Dispatch" },
    { href: "/dashboard/planning", label: "Planning" },
    { href: "/dashboard/analytics", label: "Analytics" },
    { href: "/dashboard/payments", label: "Payments" },
    { href: "/dashboard/users", label: "Users" },
  ],
  customer: [
    { href: "/dashboard", label: "Parcels" },
    { href: "/dashboard/payments", label: "Payments" },
  ],
  driver: [{ href: "/dashboard", label: "Deliveries" }],
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, logout } = useAuth();
  // Set while logging out, so the guard below doesn't redirect to /login instead of home
  const loggingOut = useRef(false);

  useEffect(() => {
    if (ready && !user && !loggingOut.current) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoaderCircle className="size-8 animate-spin text-brand-500" aria-label="Loading" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo />
            {NAV[user.role].length > 1 && (
              <nav className="hidden rounded-xl bg-slate-100 p-1 md:flex">
                {NAV[user.role].map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                        active ? "text-slate-900" : "text-slate-500 hover:text-slate-700",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="admin-nav"
                          className="absolute inset-0 rounded-lg bg-white shadow-sm"
                          transition={{ type: "spring", stiffness: 400, damping: 32 }}
                        />
                      )}
                      <span className="relative">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/dashboard/account"
              className="flex items-center gap-3 rounded-xl px-2 py-1 transition hover:bg-slate-100"
              title="Account settings"
            >
              <span className="hidden text-right sm:block">
                <span className="block text-sm font-medium text-slate-900">{user.full_name}</span>
                <span className="block text-xs text-slate-500">{ROLE[user.role].label}</span>
              </span>
              <span className="grid size-9 place-items-center rounded-full bg-linear-to-br from-brand-400 to-sky-glow text-sm font-semibold text-ink-950">
                {initials(user.full_name)}
              </span>
            </Link>
            <button
              onClick={() => {
                loggingOut.current = true;
                logout();
                router.replace("/");
              }}
              className="grid size-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        {NAV[user.role].length > 1 && (
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
            {NAV[user.role].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
                  pathname === item.href ? "bg-slate-900 text-white" : "text-slate-600",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      {user.role === "admin" && <AssistantPanel />}
    </ToastProvider>
  );
}
