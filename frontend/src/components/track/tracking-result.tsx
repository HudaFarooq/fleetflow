"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Copy, MapPin, PackageSearch, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { ProgressSteps } from "@/components/track/progress-steps";
import { ParcelStatusBadge } from "@/components/ui/badges";
import { api, ApiError } from "@/lib/api";
import { cn, formatDateTime, PARCEL_STATUS } from "@/lib/utils";

export function TrackingResult({ trackingId }: { trackingId: string }) {
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ["track", trackingId],
    queryFn: () => api.track(trackingId),
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === "delivered" ? false : 15_000),
  });

  if (isPending) return <ResultSkeleton />;

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-xl"
      >
        <motion.div
          animate={{ rotate: [0, -8, 8, -4, 0] }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mx-auto grid size-16 place-items-center rounded-2xl bg-slate-100 text-slate-500"
        >
          <PackageSearch className="size-8" />
        </motion.div>
        <h2 className="mt-5 text-xl font-semibold text-slate-900">
          {notFound ? "We couldn't find that parcel" : "Something went wrong"}
        </h2>
        <p className="mt-2 text-slate-600">
          {notFound ? (
            <>
              No parcel has the tracking ID <span className="font-mono font-medium">{trackingId}</span>. Check it and try again.
            </>
          ) : (
            error.message
          )}
        </p>
      </motion.div>
    );
  }

  const events = [...data.events].reverse(); // newest first

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-6 sm:p-8">
        <div>
          <p className="text-sm text-slate-500">Tracking ID</p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-wide text-slate-900">{data.tracking_id}</h1>
            <CopyButton text={data.tracking_id} />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-600">
            <MapPin className="size-4 text-slate-400" />
            {data.delivery_address}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ParcelStatusBadge status={data.status} />
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900"
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="border-b border-slate-100 px-4 py-8 sm:px-8">
        <ProgressSteps status={data.status} events={data.events} />
      </div>

      <div className="p-6 sm:p-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">History</h2>
        <ol className="mt-5">
          <AnimatePresence initial>
            {events.map((event, index) => (
              <motion.li
                key={`${event.status}-${event.created_at}`}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.08 }}
                className="relative flex gap-4 pb-6 last:pb-0"
              >
                {index < events.length - 1 && <span className="absolute left-[7px] top-5 h-full w-px bg-slate-200" />}
                <span
                  className={cn(
                    "relative mt-1 size-[15px] shrink-0 rounded-full border-[3px] border-white ring-1 ring-slate-200",
                    PARCEL_STATUS[event.status].dot,
                  )}
                >
                  {index === 0 && (
                    <span className={cn("absolute inset-0 animate-pulse-ring rounded-full", PARCEL_STATUS[event.status].dot)} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <p className="font-medium text-slate-900">{PARCEL_STATUS[event.status].label}</p>
                    <time className="text-xs text-slate-500">{formatDateTime(event.created_at)}</time>
                  </div>
                  {event.note && <p className="mt-0.5 text-sm text-slate-600">{event.note}</p>}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </div>
    </motion.div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard can be blocked (e.g. non-HTTPS); nothing useful to do
        }
      }}
      className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      aria-label="Copy tracking ID"
    >
      {copied ? <Check className="size-4 text-brand-600" /> : <Copy className="size-4" />}
    </button>
  );
}

function ResultSkeleton() {
  return (
    <div className="mt-8 animate-pulse rounded-3xl border border-slate-200 bg-white p-8 shadow-xl" aria-label="Loading">
      <div className="h-4 w-24 rounded bg-slate-200" />
      <div className="mt-3 h-7 w-56 rounded bg-slate-200" />
      <div className="mt-10 h-9 rounded-full bg-slate-100" />
      <div className="mt-10 space-y-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-10 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
