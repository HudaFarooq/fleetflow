"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CircleCheck, CreditCard, Package, PackageCheck, Plus, Truck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { Modal } from "@/components/dashboard/modal";
import { EmptyState, ListSkeleton, Panel, StatCard } from "@/components/dashboard/panels";
import { ParcelStatusBadge } from "@/components/ui/badges";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Parcel, ParcelInput } from "@/lib/types";
import { cn, formatDateTime, formatMoney, PARCEL_STEPS, stepIndex } from "@/lib/utils";

const IN_PROGRESS = new Set(["assigned", "picked_up", "in_transit"]);

const LocationPicker = dynamic(() => import("@/components/dashboard/location-picker"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-slate-100" />,
});

export function CustomerView() {
  const { token, user } = useAuth();
  const [booking, setBooking] = useState(false);
  const { data: parcels, isPending } = useQuery({
    queryKey: ["parcels", token],
    queryFn: () => api.parcels(token!),
    refetchInterval: 15_000,
  });

  const list = parcels ?? [];
  const firstName = user?.full_name.split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Hi {firstName} 👋</h1>
          <p className="mt-1 text-slate-600">Book a delivery or check on the ones already on their way.</p>
        </div>
        <Button onClick={() => setBooking(true)}>
          <Plus className="size-4" />
          Book a parcel
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard index={0} label="All parcels" value={list.length} icon={Package} accent="bg-slate-700" />
        <StatCard
          index={1}
          label="On the way"
          value={list.filter((parcel) => IN_PROGRESS.has(parcel.status)).length}
          icon={Truck}
          accent="bg-amber-500"
        />
        <StatCard
          index={2}
          label="Delivered"
          value={list.filter((parcel) => parcel.status === "delivered").length}
          icon={PackageCheck}
          accent="bg-brand-500"
        />
      </div>

      <Panel title="Your parcels">
        {isPending ? (
          <ListSkeleton />
        ) : list.length === 0 ? (
          <EmptyState icon={Package} title="No parcels yet" text="Book your first delivery and it will show up here with live status." />
        ) : (
          <ul className="divide-y divide-slate-100">
            <AnimatePresence initial={false}>
              {list.map((parcel, index) => (
                <ParcelRow key={parcel.id} parcel={parcel} index={index} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Panel>

      <BookParcelModal open={booking} onClose={() => setBooking(false)} />
    </div>
  );
}

function ParcelRow({ parcel, index }: { parcel: Parcel; index: number }) {
  const step = stepIndex(parcel.status);
  const progress = parcel.status === "failed" ? 1 : step / (PARCEL_STEPS.length - 1);
  const needsPayment = !parcel.paid && parcel.status === "created";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
    >
      <div className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-slate-50">
        <Link href={`/track/${parcel.tracking_id}`} className="group min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-semibold text-slate-900">{parcel.tracking_id}</p>
            <ArrowUpRight className="size-4 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-500" />
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            To {parcel.receiver_name} · {parcel.delivery_address}
          </p>
        </Link>
        <div className="hidden w-40 sm:block">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className={cn("h-full rounded-full", parcel.status === "failed" ? "bg-rose-500" : "bg-brand-500")}
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">{formatDateTime(parcel.created_at)}</p>
        </div>
        <span className="w-20 text-right text-sm tabular-nums text-slate-600">{formatMoney(parcel.price_cents, parcel.currency)}</span>
        {needsPayment ? (
          <ButtonLink href={`/dashboard/checkout/${parcel.id}`} size="sm" className="w-28">
            <CreditCard className="size-4" />
            Pay now
          </ButtonLink>
        ) : (
          <span className="flex w-28 justify-end">
            <ParcelStatusBadge status={parcel.status} />
          </span>
        )}
      </div>
    </motion.li>
  );
}

const EMPTY_FORM = { receiver_name: "", receiver_phone: "", pickup_address: "", delivery_address: "", weight_kg: "" };

function BookParcelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [created, setCreated] = useState<Parcel | null>(null);

  const mutation = useMutation({
    mutationFn: (data: ParcelInput) => api.createParcel(token!, data),
    onSuccess: (parcel) => {
      setCreated(parcel);
      setForm(EMPTY_FORM);
      setPin(null);
      queryClient.invalidateQueries({ queryKey: ["parcels"] });
    },
  });

  const close = () => {
    onClose();
    // wait for the exit animation before resetting the content
    setTimeout(() => {
      setCreated(null);
      mutation.reset();
    }, 300);
  };

  const update = (field: keyof typeof EMPTY_FORM) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <Modal open={open} onClose={close} title={created ? "Parcel booked" : "Book a parcel"}>
      {created ? (
        <div className="py-4 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
            className="mx-auto grid size-16 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/40"
          >
            <CircleCheck className="size-8" />
          </motion.div>
          <p className="mt-5 text-slate-600">Your tracking ID is</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-wide text-slate-900">{created.tracking_id}</p>
          <p className="mt-2 text-sm text-slate-500">
            Pay {formatMoney(created.price_cents, created.currency)} and we&apos;ll send it out. Share the tracking ID with{" "}
            {created.receiver_name} so they can follow the delivery.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={close}>
              Pay later
            </Button>
            <ButtonLink href={`/dashboard/checkout/${created.id}`}>
              <CreditCard className="size-4" />
              Pay {formatMoney(created.price_cents, created.currency)}
            </ButtonLink>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              ...form,
              weight_kg: Number(form.weight_kg),
              ...(pin && { delivery_latitude: pin.latitude, delivery_longitude: pin.longitude }),
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Receiver name" required value={form.receiver_name} onChange={update("receiver_name")} />
            <Input label="Receiver phone" type="tel" required minLength={5} value={form.receiver_phone} onChange={update("receiver_phone")} />
          </div>
          <Input label="Pickup address" required value={form.pickup_address} onChange={update("pickup_address")} />
          <Input label="Delivery address" required value={form.delivery_address} onChange={update("delivery_address")} />
          <div>
            <p className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-slate-700">
              Pin the delivery location
              <span className="text-xs font-normal text-slate-500">{pin ? "Pinned · drag to adjust" : "Click the map"}</span>
            </p>
            <div className="h-48 overflow-hidden rounded-xl border border-slate-300">
              <LocationPicker value={pin} onChange={setPin} />
            </div>
            <p className="mt-1 text-xs text-slate-500">Helps us plan the fastest route. Optional, but parcels without a pin can&apos;t be route-planned.</p>
          </div>
          <Input
            label="Weight (kg)"
            type="number"
            required
            min={0.1}
            max={1000}
            step={0.1}
            value={form.weight_kg}
            onChange={update("weight_kg")}
          />
          <PriceQuote weight={Number(form.weight_kg)} />
          <FormError message={mutation.error?.message ?? null} />
          <Button type="submit" className="w-full" loading={mutation.isPending}>
            Book parcel
          </Button>
        </form>
      )}
    </Modal>
  );
}

/** Live price while the customer types the weight, debounced so we don't query on every keystroke. */
function PriceQuote({ weight }: { weight: number }) {
  const [debounced, setDebounced] = useState(weight);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(weight), 300);
    return () => clearTimeout(timer);
  }, [weight]);

  const valid = debounced > 0 && debounced <= 1000;
  const { data } = useQuery({ queryKey: ["quote", debounced], queryFn: () => api.quote(debounced), enabled: valid });

  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">Price</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={valid && data ? data.amount_cents : "none"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="text-lg font-semibold tabular-nums text-slate-900"
        >
          {valid && data ? formatMoney(data.amount_cents, data.currency) : "Enter a weight"}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
