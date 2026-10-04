"use client";

import { useQuery } from "@tanstack/react-query";

import { CountUp } from "@/components/ui/count-up";
import { Reveal } from "@/components/ui/reveal";
import { api } from "@/lib/api";

export function LiveStats() {
  const { data, isError } = useQuery({ queryKey: ["public-stats"], queryFn: api.publicStats });

  // The landing page still works without the API; it just skips the live numbers
  if (isError) return null;

  const items = [
    { label: "Parcels booked", value: data?.parcels_total },
    { label: "Delivered", value: data?.parcels_delivered },
    { label: "Vehicles in the fleet", value: data?.vehicles_total },
    { label: "Electric share", value: data?.electric_share, suffix: "%" },
  ];

  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-8 flex items-center justify-center gap-2 text-sm text-slate-500">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
          </span>
          Live numbers from the FleetFlow database
        </Reveal>
        <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {items.map((item, index) => (
            <Reveal key={item.label} delay={index * 0.08} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
              <dd className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                {item.value === undefined ? (
                  <span className="inline-block h-10 w-20 animate-pulse rounded-lg bg-slate-200 align-middle" />
                ) : (
                  <CountUp value={item.value} suffix={item.suffix} />
                )}
              </dd>
              <dt className="mt-2 text-sm text-slate-500">{item.label}</dt>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
