"use client";

import { Truck, User, UserCog } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { useAuth } from "@/lib/auth";

// Created by `python -m scripts.init_db --seed`
const DEMO_ACCOUNTS = [
  { label: "Customer", icon: User, email: "customer@fleetflow.dev", password: "customer12345" },
  { label: "Admin", icon: UserCog, email: "admin@fleetflow.dev", password: "admin12345" },
  { label: "Driver", icon: Truck, email: "driver@fleetflow.dev", password: "driver12345" },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, user, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user, router]);

  async function signIn(emailValue: string, passwordValue: string) {
    setError(null);
    setLoading(true);
    try {
      await login(emailValue, passwordValue);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to manage your parcels and fleet.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          signIn(email, password);
        }}
      >
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div>
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Link href="/forgot-password" className="mt-1.5 inline-block text-sm text-brand-600 hover:text-brand-700">
            Forgot password?
          </Link>
        </div>
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={loading}>
          Log in
        </Button>
      </form>

      <div className="mt-8">
        <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or try a demo account
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.label}
              type="button"
              disabled={loading}
              onClick={() => {
                setEmail(account.email);
                setPassword(account.password);
                signIn(account.email, account.password);
              }}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg hover:shadow-brand-500/10 disabled:opacity-50"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-brand-500 group-hover:text-white">
                <account.icon className="size-4" />
              </span>
              {account.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-slate-600">
        New to FleetFlow?{" "}
        <Link href="/register" className="font-medium text-brand-600 hover:text-brand-700">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
