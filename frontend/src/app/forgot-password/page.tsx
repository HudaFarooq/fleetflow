"use client";

import { MailCheck } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a link to set a new one.">
      {sent ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 15 }}
            className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"
          >
            <MailCheck className="size-7" />
          </motion.span>
          <p className="mt-5 font-medium text-slate-900">Check your inbox</p>
          <p className="mt-2 text-sm text-slate-600">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. It works for 30 minutes.
          </p>
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            Running locally? Emails are printed in the API server&apos;s terminal instead of being sent.
          </p>
        </motion.div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setLoading(true);
            try {
              await api.forgotPassword(email);
              setSent(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <FormError message={error} />
          <Button type="submit" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-8 text-center text-sm text-slate-600">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Back to log in
        </Link>
      </p>
    </AuthShell>
  );
}
