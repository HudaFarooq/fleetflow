"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleCheck, CreditCard, FlaskConical, Lock, MapPin, Package } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

import { ListSkeleton } from "@/components/dashboard/panels";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Parcel, Payment } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/utils";

// The sandbox provider's test cards. Real card numbers are always refused in test mode.
const TEST_CARDS = [
  { number: "4242 4242 4242 4242", label: "Succeeds" },
  { number: "4000 0000 0000 0002", label: "Declined" },
  { number: "4000 0000 0000 9995", label: "Insufficient funds" },
];

export function Checkout({ parcelId }: { parcelId: number }) {
  const { token } = useAuth();
  const { data: parcel, isPending, error } = useQuery({
    queryKey: ["parcel", token, parcelId],
    queryFn: () => api.parcel(token!, parcelId),
  });
  const [receipt, setReceipt] = useState<Payment | null>(null);

  if (isPending) return <ListSkeleton rows={3} />;
  if (error) return <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error.message}</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" />
        Back to parcels
      </Link>
      <AnimatePresence mode="wait">
        {receipt ? (
          <Receipt key="receipt" parcel={parcel} payment={receipt} />
        ) : parcel.paid ? (
          <motion.div key="paid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-center">
            <p className="font-medium text-slate-900">This parcel is already paid for.</p>
            <ButtonLink href={`/track/${parcel.tracking_id}`} variant="outline" className="mt-4">
              Track it
            </ButtonLink>
          </motion.div>
        ) : (
          <motion.div key="form" exit={{ opacity: 0, y: -10 }} className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <OrderSummary parcel={parcel} />
            <PaymentForm parcel={parcel} onPaid={setReceipt} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OrderSummary({ parcel }: { parcel: Parcel }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      className="h-fit rounded-3xl bg-ink-950 p-6 text-white"
    >
      <p className="text-sm text-slate-400">You&apos;re paying for</p>
      <p className="mt-1 font-mono text-lg font-semibold">{parcel.tracking_id}</p>
      <div className="mt-6 space-y-3 text-sm">
        <p className="flex items-start gap-2 text-slate-300">
          <Package className="mt-0.5 size-4 shrink-0 text-slate-500" />
          {parcel.weight_kg} kg parcel for {parcel.receiver_name}
        </p>
        <p className="flex items-start gap-2 text-slate-300">
          <MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" />
          {parcel.pickup_address} → {parcel.delivery_address}
        </p>
      </div>
      <div className="mt-6 flex items-baseline justify-between border-t border-white/10 pt-6">
        <span className="text-slate-400">Total</span>
        <span className="text-3xl font-semibold tracking-tight">{formatMoney(parcel.price_cents, parcel.currency)}</span>
      </div>
    </motion.div>
  );
}

function formatCardNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

function PaymentForm({ parcel, onPaid }: { parcel: Parcel; onPaid: (payment: Payment) => void }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });

  const mutation = useMutation({
    mutationFn: () => {
      const [month, year] = card.expiry.split("/").map((part) => Number(part.trim()));
      return api.payParcel(token!, parcel.id, {
        number: card.number,
        exp_month: month || 0,
        exp_year: year < 100 ? 2000 + year : year,
        cvc: card.cvc,
      });
    },
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: ["parcels"] });
      queryClient.invalidateQueries({ queryKey: ["parcel"] });
      onPaid(payment);
    },
    // Failed attempts are recorded too, so refresh payment history either way
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["payments"] }),
  });

  return (
    <motion.form
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CreditCard className="size-5 text-slate-500" />
          Pay by card
        </h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
          <FlaskConical className="size-3.5" />
          Test mode
        </span>
      </div>

      <div className="mt-4 rounded-2xl bg-amber-50/60 p-4 text-sm text-amber-900">
        <p>No real money moves. Use a test card (any future expiry, any 3-digit CVC):</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TEST_CARDS.map((test) => (
            <button
              key={test.number}
              type="button"
              onClick={() => setCard({ number: test.number, expiry: "12/34", cvc: "123" })}
              className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-left text-xs transition hover:border-amber-400"
            >
              <span className="block font-mono text-slate-900">{test.number}</span>
              <span className="text-amber-700">{test.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Input
          label="Card number"
          inputMode="numeric"
          autoComplete="off"
          required
          placeholder="4242 4242 4242 4242"
          value={card.number}
          onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Expiry (MM/YY)"
            inputMode="numeric"
            autoComplete="off"
            required
            placeholder="12/34"
            value={card.expiry}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
              setCard({ ...card, expiry: digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits });
            }}
          />
          <Input
            label="CVC"
            inputMode="numeric"
            autoComplete="off"
            required
            placeholder="123"
            value={card.cvc}
            onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          />
        </div>
      </div>

      <div className="mt-5">
        <FormError message={mutation.error?.message ?? null} />
      </div>
      <Button type="submit" size="lg" className="mt-5 w-full" loading={mutation.isPending}>
        <Lock className="size-4" />
        Pay {formatMoney(parcel.price_cents, parcel.currency)}
      </Button>
    </motion.form>
  );
}

function Receipt({ parcel, payment }: { parcel: Parcel; payment: Payment }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
      className="mx-auto mt-6 max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white text-center shadow-xl"
    >
      <div className="relative bg-ink-950 px-6 pb-10 pt-10">
        <div className="bg-grid absolute inset-0 opacity-40" />
        {/* A burst of dots behind the check mark */}
        {Array.from({ length: 10 }, (_, index) => {
          const angle = (index / 10) * Math.PI * 2;
          return (
            <motion.span
              key={index}
              className="absolute left-1/2 top-[4.5rem] size-2 rounded-full bg-brand-400"
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: Math.cos(angle) * 70, y: Math.sin(angle) * 70, opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.9, delay: 0.25, ease: "easeOut" }}
            />
          );
        })}
        <motion.span
          initial={{ scale: 0, rotate: -60 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 13, delay: 0.1 }}
          className="relative mx-auto grid size-16 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/40"
        >
          <CircleCheck className="size-8" />
        </motion.span>
        <p className="relative mt-5 text-lg font-semibold text-white">Payment successful</p>
        <p className="relative text-3xl font-semibold tracking-tight text-white">{formatMoney(payment.amount_cents, payment.currency)}</p>
      </div>
      <dl className="space-y-3 p-6 text-left text-sm">
        {[
          ["Parcel", parcel.tracking_id],
          ["Paid with", `${payment.card_brand} ending ${payment.card_last4}`],
          ["Date", formatDateTime(payment.created_at)],
          ["Reference", `#${payment.id}`],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="px-6 text-xs text-slate-500">A receipt has been emailed to you. The dispatcher can now send your parcel out.</p>
      <div className="flex gap-2 p-6">
        <ButtonLink href={`/track/${parcel.tracking_id}`} variant="outline" className="flex-1">
          Track parcel
        </ButtonLink>
        <ButtonLink href="/dashboard" className="flex-1">
          Done
        </ButtonLink>
      </div>
    </motion.div>
  );
}
