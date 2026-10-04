"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CreditCard, RotateCcw, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Modal } from "@/components/dashboard/modal";
import { EmptyState, ListSkeleton, Panel, StatCard } from "@/components/dashboard/panels";
import { useToast } from "@/components/dashboard/toast";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Payment, PaymentStatus } from "@/lib/types";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

const STATUS: Record<PaymentStatus, { label: string; badge: string; icon: typeof CircleCheck }> = {
  succeeded: { label: "Paid", badge: "bg-brand-50 text-brand-700 ring-brand-200", icon: CircleCheck },
  failed: { label: "Failed", badge: "bg-rose-50 text-rose-700 ring-rose-200", icon: XCircle },
  refunded: { label: "Refunded", badge: "bg-slate-100 text-slate-700 ring-slate-200", icon: RotateCcw },
};

export function PaymentsView() {
  const { token, user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const [refunding, setRefunding] = useState<Payment | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  useEffect(() => {
    if (user?.role === "driver") router.replace("/dashboard");
  }, [user, router]);

  const { data: payments = [], isPending } = useQuery({
    queryKey: ["payments", token],
    queryFn: () => api.payments(token!),
    enabled: user?.role !== "driver",
  });

  // Totals are shown per currency so mixed currencies are never added together
  const succeeded = payments.filter((payment) => payment.status === "succeeded");
  const currency = payments[0]?.currency ?? "USD";
  const total = succeeded.filter((payment) => payment.currency === currency).reduce((sum, payment) => sum + payment.amount_cents, 0);
  const refunded = payments.filter((payment) => payment.status === "refunded");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Payments</h1>
        <p className="mt-1 text-slate-600">
          {isAdmin ? "Every payment across FleetFlow. Refund parcels that haven't left the depot or failed delivery." : "Your payment history and receipts."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-sm text-slate-500">{isAdmin ? "Revenue collected" : "Total paid"}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{formatMoney(total, currency)}</p>
        </motion.div>
        <StatCard index={1} label="Successful payments" value={succeeded.length} icon={CreditCard} accent="bg-brand-500" />
        <StatCard index={2} label="Refunds" value={refunded.length} icon={RotateCcw} accent="bg-slate-600" />
      </div>

      <Panel title="History">
        {isPending ? (
          <ListSkeleton />
        ) : payments.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payments yet" text="Payments appear here as soon as a parcel is paid for." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Parcel</th>
                  <th className="px-5 py-3 font-medium">Card</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  {isAdmin && <th className="px-5 py-3 text-right font-medium">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <AnimatePresence initial={false}>
                  {payments.map((payment, index) => {
                    const status = STATUS[payment.status];
                    return (
                      <motion.tr
                        key={payment.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index, 10) * 0.03 }}
                      >
                        <td className="px-5 py-3.5 text-slate-600">{formatDateTime(payment.created_at)}</td>
                        <td className="px-5 py-3.5">
                          <Link href={`/track/${payment.tracking_id}`} className="font-mono font-semibold text-slate-900 hover:text-brand-600">
                            {payment.tracking_id}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {payment.card_last4 ? `${payment.card_brand} •••• ${payment.card_last4}` : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", status.badge)}>
                            <status.icon className="size-3.5" />
                            {status.label}
                          </span>
                          {payment.failure_reason && <p className="mt-1 max-w-56 text-xs text-slate-500">{payment.failure_reason}</p>}
                        </td>
                        <td className={cn("px-5 py-3.5 text-right font-medium tabular-nums", payment.status === "succeeded" ? "text-slate-900" : "text-slate-400 line-through")}>
                          {formatMoney(payment.amount_cents, payment.currency)}
                        </td>
                        {isAdmin && (
                          <td className="px-5 py-3.5 text-right">
                            {payment.refundable && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRefunding(payment);
                                  setRefundOpen(true);
                                }}
                              >
                                Refund
                              </Button>
                            )}
                          </td>
                        )}
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <RefundModal payment={refunding} open={refundOpen} onClose={() => setRefundOpen(false)} />
    </div>
  );
}

function RefundModal({ payment, open, onClose }: { payment: Payment | null; open: boolean; onClose: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: number) => api.refundPayment(token!, id),
    onSuccess: (refunded) => {
      toast(`Refunded ${formatMoney(refunded.amount_cents, refunded.currency)} for ${refunded.tracking_id}`);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["parcels"] });
      onClose();
    },
  });
  const close = () => {
    mutation.reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Refund this payment?">
      {payment && (
        <div className="space-y-5">
          <p className="text-slate-600">
            <strong className="text-slate-900">{formatMoney(payment.amount_cents, payment.currency)}</strong> goes back to the
            customer&apos;s {payment.card_brand} ending {payment.card_last4} for parcel{" "}
            <span className="font-mono">{payment.tracking_id}</span>. The parcel will need paying for again before it can be
            dispatched.
          </p>
          <FormError message={mutation.error?.message ?? null} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate(payment.id)}>
              Refund
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
