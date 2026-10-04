"use client";

import { CircleCheck } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { api } from "@/lib/api";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthShell title="Link not valid" subtitle="This reset link is missing its code.">
        <ButtonLink href="/forgot-password" className="w-full">
          Request a new link
        </ButtonLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="You'll be signed out on every other device.">
      {done ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <motion.span
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
            className="mx-auto grid size-14 place-items-center rounded-full bg-brand-500 text-white"
          >
            <CircleCheck className="size-7" />
          </motion.span>
          <p className="mt-5 font-medium text-slate-900">Password updated</p>
          <ButtonLink href="/login" className="mt-6 w-full">
            Log in
          </ButtonLink>
        </motion.div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (password !== confirm) {
              setError("The two passwords don't match");
              return;
            }
            setError(null);
            setLoading(true);
            try {
              await api.resetPassword(token, password);
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={64}
            hint="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <FormError message={error} />
          <Button type="submit" className="w-full" loading={loading}>
            Set new password
          </Button>
          <p className="text-center text-sm text-slate-600">
            Link expired?{" "}
            <Link href="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
              Get a new one
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
