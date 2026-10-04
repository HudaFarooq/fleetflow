"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Pencil, Plus, Search, ShieldCheck, Trash2, Truck, User as UserIcon, UserX } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { Modal } from "@/components/dashboard/modal";
import { EmptyState, ListSkeleton, Panel, StatCard } from "@/components/dashboard/panels";
import { useToast } from "@/components/dashboard/toast";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Role, User, UserUpdate } from "@/lib/types";
import { cn, formatDateTime, initials, ROLE } from "@/lib/utils";

const ROLE_FILTERS: { id: Role | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "customer", label: "Customers" },
  { id: "driver", label: "Drivers" },
  { id: "admin", label: "Admins" },
];

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; user: User }
  | { kind: "delete"; user: User }
  | { kind: "signout"; user: User }
  | null;

export function UserManagement() {
  const { token, user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  // `dialog` keeps its content while the closing animation plays; `open` controls visibility
  const [dialog, setDialogContent] = useState<Dialog>(null);
  const [open, setOpen] = useState(false);
  const setDialog = (next: Dialog) => {
    setDialogContent(next);
    setOpen(true);
  };

  const { data: users = [], isPending } = useQuery({ queryKey: ["users", token], queryFn: () => api.users(token!) });

  const term = search.trim().toLowerCase();
  const visible = users.filter(
    (user) =>
      (roleFilter === "all" || user.role === roleFilter) &&
      (!term || user.full_name.toLowerCase().includes(term) || user.email.includes(term)),
  );
  const close = () => setOpen(false);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Users</h1>
          <p className="mt-1 text-slate-600">Create accounts for your team, change roles, and switch off access.</p>
        </div>
        <Button onClick={() => setDialog({ kind: "create" })}>
          <Plus className="size-4" />
          Add user
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard index={0} label="Customers" value={users.filter((u) => u.role === "customer").length} icon={UserIcon} accent="bg-sky-500" />
        <StatCard index={1} label="Drivers" value={users.filter((u) => u.role === "driver").length} icon={Truck} accent="bg-amber-500" />
        <StatCard index={2} label="Admins" value={users.filter((u) => u.role === "admin").length} icon={ShieldCheck} accent="bg-violet-500" />
        <StatCard index={3} label="Deactivated" value={users.filter((u) => !u.is_active).length} icon={UserX} accent="bg-rose-500" />
      </div>

      <Panel
        title={`All users (${users.length})`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search users</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or email"
                className="h-9 w-56 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Filter by role">
              {ROLE_FILTERS.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={roleFilter === item.id}
                  onClick={() => setRoleFilter(item.id)}
                  className={cn(
                    "relative rounded-lg px-3 py-1 text-sm font-medium transition-colors",
                    roleFilter === item.id ? "text-slate-900" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {roleFilter === item.id && (
                    <motion.span layoutId="role-filter" className="absolute inset-0 rounded-lg bg-white shadow-sm" />
                  )}
                  <span className="relative">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        }
      >
        {isPending ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState icon={UserIcon} title="No users found" text="Try a different search or role filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Joined</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <AnimatePresence initial={false} mode="popLayout">
                  {visible.map((user) => {
                    const isMe = user.id === me?.id;
                    return (
                      <motion.tr
                        key={user.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, x: -20 }}
                        className={cn(!user.is_active && "bg-slate-50/70")}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                "grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold",
                                user.is_active ? "bg-linear-to-br from-brand-400 to-sky-glow text-ink-950" : "bg-slate-200 text-slate-500",
                              )}
                            >
                              {initials(user.full_name)}
                            </span>
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-medium text-slate-900">
                                {user.full_name}
                                {isMe && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">You</span>}
                              </p>
                              <p className="truncate text-xs text-slate-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", ROLE[user.role].badge)}>
                            {ROLE[user.role].label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", user.is_active ? "text-brand-700" : "text-slate-500")}>
                            <span className={cn("size-1.5 rounded-full", user.is_active ? "bg-brand-500" : "bg-slate-400")} />
                            {user.is_active ? "Active" : "Deactivated"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">{formatDateTime(user.created_at)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-1">
                            <IconButton label={`Edit ${user.full_name}`} onClick={() => setDialog({ kind: "edit", user })}>
                              <Pencil className="size-4" />
                            </IconButton>
                            <IconButton label={`Sign ${user.full_name} out everywhere`} onClick={() => setDialog({ kind: "signout", user })}>
                              <LogOut className="size-4" />
                            </IconButton>
                            <IconButton
                              label={isMe ? "You can't delete your own account" : `Delete ${user.full_name}`}
                              onClick={() => setDialog({ kind: "delete", user })}
                              disabled={isMe}
                              danger
                            >
                              <Trash2 className="size-4" />
                            </IconButton>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <UserFormModal
        open={open && (dialog?.kind === "create" || dialog?.kind === "edit")}
        user={dialog?.kind === "edit" ? dialog.user : null}
        isMe={dialog?.kind === "edit" && dialog.user.id === me?.id}
        onClose={close}
      />
      <ConfirmModal
        open={open && (dialog?.kind === "delete" || dialog?.kind === "signout")}
        dialog={dialog?.kind === "delete" || dialog?.kind === "signout" ? dialog : null}
        onClose={close}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-slate-500 transition disabled:cursor-not-allowed disabled:opacity-30",
        danger ? "hover:bg-rose-50 hover:text-rose-600" : "hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}

const EMPTY_FORM = { full_name: "", email: "", role: "driver" as Role, password: "", is_active: true };

function UserFormModal({ open, user, isMe, onClose }: { open: boolean; user: User | null; isMe: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={user ? `Edit ${user.full_name}` : "Add a user"}>
      {/* Keyed so the form resets whenever a different user (or "new") is opened */}
      <UserForm key={user?.id ?? "new"} user={user} isMe={isMe} onDone={onClose} />
    </Modal>
  );
}

function UserForm({ user, isMe, onDone }: { user: User | null; isMe: boolean; onDone: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(
    user ? { full_name: user.full_name, email: user.email, role: user.role, password: "", is_active: user.is_active } : EMPTY_FORM,
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) return api.createUser(token!, form);
      // Only send what changed; a blank password means "keep the current one"
      const changes: UserUpdate = {};
      if (form.full_name !== user.full_name) changes.full_name = form.full_name;
      if (form.email !== user.email) changes.email = form.email;
      if (form.role !== user.role) changes.role = form.role;
      if (form.is_active !== user.is_active) changes.is_active = form.is_active;
      if (form.password) changes.password = form.password;
      return api.updateUser(token!, user.id, changes);
    },
    onSuccess: (saved) => {
      toast(user ? `${saved.full_name} updated` : `${saved.full_name} added as ${ROLE[saved.role].label.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      onDone();
    },
  });

  const signsOut = user && (form.role !== user.role || form.password || (user.is_active && !form.is_active));

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Input label="Full name" required maxLength={100} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
      <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Select
        label="Role"
        value={form.role}
        disabled={isMe}
        onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
      >
        <option value="customer">Customer: books and tracks parcels</option>
        <option value="driver">Driver: delivers assigned parcels</option>
        <option value="admin">Admin: dispatches parcels and manages users</option>
      </Select>
      <Input
        label={user ? "New password" : "Password"}
        type="password"
        autoComplete="new-password"
        required={!user}
        minLength={8}
        maxLength={64}
        hint={user ? "Leave blank to keep their current password" : "At least 8 characters. Share it with them securely."}
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />

      {user && (
        <label className={cn("flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4", isMe && "opacity-50")}>
          <span>
            <span className="block text-sm font-medium text-slate-900">Account active</span>
            <span className="block text-xs text-slate-500">Deactivated users can&apos;t log in, but their history is kept.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={form.is_active}
            disabled={isMe}
            onClick={() => setForm({ ...form, is_active: !form.is_active })}
            className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", form.is_active ? "bg-brand-500" : "bg-slate-300")}
          >
            <motion.span
              className="absolute top-0.5 size-5 rounded-full bg-white shadow"
              animate={{ left: form.is_active ? 22 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
        </label>
      )}

      {isMe && <p className="text-xs text-slate-500">You can&apos;t change your own role or deactivate yourself.</p>}
      {signsOut && (
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          {isMe
            ? "Saving a new password will sign you out on all your devices, including this one."
            : `Saving will sign ${user.full_name} out on all their devices.`}
        </p>
      )}

      <FormError message={mutation.error?.message ?? null} />
      <Button type="submit" className="w-full" loading={mutation.isPending}>
        {user ? "Save changes" : "Create user"}
      </Button>
    </form>
  );
}

function ConfirmModal({
  open,
  dialog,
  onClose,
}: {
  open: boolean;
  dialog: { kind: "delete" | "signout"; user: User } | null;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ kind, user }: { kind: "delete" | "signout"; user: User }) => {
      if (kind === "delete") await api.deleteUser(token!, user.id);
      else await api.revokeSessions(token!, user.id);
    },
    onSuccess: (_, { kind, user }) => {
      toast(kind === "delete" ? `${user.full_name} deleted` : `${user.full_name} signed out of all devices`);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      onClose();
    },
  });

  const close = () => {
    mutation.reset();
    onClose();
  };
  const isDelete = dialog?.kind === "delete";

  return (
    <Modal open={open} onClose={close} title={isDelete ? "Delete user?" : "Sign out everywhere?"}>
      {dialog && (
        <div className="space-y-5">
          <p className="text-slate-600">
            {isDelete ? (
              <>
                <strong className="text-slate-900">{dialog.user.full_name}</strong> will be permanently removed. If they
                drive a vehicle, it will be left without a driver. This can&apos;t be undone.
              </>
            ) : (
              <>
                <strong className="text-slate-900">{dialog.user.full_name}</strong> will be logged out on every device.
                They can log in again with their password.
              </>
            )}
          </p>
          <FormError message={mutation.error?.message ?? null} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              variant={isDelete ? "danger" : "dark"}
              loading={mutation.isPending}
              onClick={() => mutation.mutate(dialog)}
            >
              {isDelete ? "Delete user" : "Sign out"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
