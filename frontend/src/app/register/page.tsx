"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <AuthShell title="Create your account" subtitle="Book parcels and follow every delivery live.">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setLoading(true);
          try {
            await api.register(form);
            await login(form.email, form.password);
            router.push("/dashboard");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Sign-up failed");
            setLoading(false);
          }
        }}
      >
        <Input label="Full name" autoComplete="name" required value={form.full_name} onChange={update("full_name")} />
        <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={update("email")} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={64}
          hint="At least 8 characters"
          value={form.password}
          onChange={update("password")}
        />
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
