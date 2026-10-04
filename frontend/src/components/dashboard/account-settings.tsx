"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Trash2, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Modal } from "@/components/dashboard/modal";
import { useToast } from "@/components/dashboard/toast";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, ROLE } from "@/lib/utils";

export function AccountSettings() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Account</h1>
        <p className="mt-1 text-slate-600">
          {ROLE[user.role].label} account · member since {formatDateTime(user.created_at)}
        </p>
      </div>
      <ProfileSection />
      <PasswordSection />
      <SessionsSection />
      <DangerZone />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  text,
  index,
  danger,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  text: string;
  index: number;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`grid gap-6 rounded-3xl border bg-white p-6 shadow-sm md:grid-cols-[1fr_1.4fr] ${danger ? "border-rose-200" : "border-slate-200"}`}
    >
      <div>
        <span className={`grid size-10 place-items-center rounded-xl ${danger ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"}`}>
          <Icon className="size-5" />
        </span>
        <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{text}</p>
      </div>
      <div>{children}</div>
    </motion.section>
  );
}

function ProfileSection() {
  const { token, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ full_name: user!.full_name, email: user!.email });

  const mutation = useMutation({
    mutationFn: () => api.updateMe(token!, form),
    onSuccess: (saved) => {
      queryClient.setQueryData(["me", token], saved);
      toast("Profile saved");
    },
  });
  const unchanged = form.full_name === user!.full_name && form.email === user!.email;

  return (
    <Section index={0} icon={UserRound} title="Profile" text="Your name and the email you log in with.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Input label="Full name" required maxLength={100} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <FormError message={mutation.error?.message ?? null} />
        <Button type="submit" disabled={unchanged} loading={mutation.isPending}>
          Save profile
        </Button>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const { token, replaceToken } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.changePassword(token!, form.current, form.next),
    onSuccess: ({ access_token }) => {
      replaceToken(access_token); // this device stays logged in; others are signed out
      setForm({ current: "", next: "", confirm: "" });
      toast("Password changed. Other devices have been signed out.");
    },
    onError: (err) => setError(err.message),
  });

  return (
    <Section index={1} icon={KeyRound} title="Password" text="Changing it signs you out on every other device.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (form.next !== form.confirm) {
            setError("The new passwords don't match");
            return;
          }
          setError(null);
          mutation.mutate();
        }}
      >
        <Input label="Current password" type="password" autoComplete="current-password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        <Input label="New password" type="password" autoComplete="new-password" required minLength={8} maxLength={64} hint="At least 8 characters" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        <FormError message={error} />
        <Button type="submit" loading={mutation.isPending}>
          Change password
        </Button>
      </form>
    </Section>
  );
}

function SessionsSection() {
  const { token, logout } = useAuth();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: () => api.signOutEverywhere(token!),
    onSuccess: () => {
      logout();
      router.replace("/login");
    },
  });

  return (
    <Section index={2} icon={LogOut} title="Sessions" text="Lost a phone or used a shared computer? End every session at once.">
      <p className="text-sm text-slate-600">This logs you out everywhere, including here. You can log straight back in.</p>
      <FormError message={mutation.error?.message ?? null} />
      <Button variant="dark" className="mt-4" loading={mutation.isPending} onClick={() => mutation.mutate()}>
        Sign out of all devices
      </Button>
    </Section>
  );
}

function DangerZone() {
  const { token, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<"deleted" | "deactivated" | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.deleteMe(token!, password),
    onSuccess: ({ result }) => setResult(result),
  });

  const finish = () => {
    logout();
    router.replace("/");
  };

  return (
    <Section index={3} icon={Trash2} title="Close account" text="Permanently removes your account." danger>
      <p className="text-sm text-slate-600">
        If you&apos;ve sent parcels, your account is deactivated instead, so delivery records stay correct for the
        receivers and drivers.
      </p>
      <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>
        Close my account
      </Button>

      <Modal open={open} onClose={result ? finish : () => setOpen(false)} title={result ? "Account closed" : "Close your account?"}>
        {result ? (
          <div className="space-y-5">
            <p className="text-slate-600">
              {result === "deleted"
                ? "Your account has been deleted."
                : "Your account has been deactivated. Your delivery history is kept, but nobody can log in to it."}
            </p>
            <Button className="w-full" onClick={finish}>
              Done
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <p className="text-slate-600">Enter your password to confirm. This can&apos;t be undone.</p>
            <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <FormError message={mutation.error?.message ?? null} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" loading={mutation.isPending}>
                Close account
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Section>
  );
}
