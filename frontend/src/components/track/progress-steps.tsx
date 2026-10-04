"use client";

import { Check, X } from "lucide-react";
import { motion } from "motion/react";

import type { ParcelStatus, TrackingEvent } from "@/lib/types";
import { cn, PARCEL_STATUS, PARCEL_STEPS, stepIndex } from "@/lib/utils";

/** Horizontal stepper: Booked → Assigned → Picked up → In transit → Delivered */
export function ProgressSteps({ status, events }: { status: ParcelStatus; events: TrackingEvent[] }) {
  const failed = status === "failed";
  // For a failed parcel, show progress up to the last step it actually reached
  const reached = failed
    ? Math.max(...events.map((event) => stepIndex(event.status)).filter((index) => index >= 0), 0)
    : stepIndex(status);
  const progress = reached / (PARCEL_STEPS.length - 1);

  return (
    <div className="relative">
      <div className="absolute left-8 right-8 top-4 h-1 rounded-full bg-slate-200" />
      <motion.div
        className={cn(
          "absolute left-8 right-8 top-4 h-1 origin-left rounded-full",
          failed ? "bg-rose-500" : "bg-linear-to-r from-brand-500 to-sky-glow",
        )}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: progress }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      />
      <ol className="relative flex justify-between">
        {PARCEL_STEPS.map((step, index) => {
          const done = index <= reached;
          const isFailurePoint = failed && index === reached + 1;
          return (
            <li key={step} className="flex w-16 flex-col items-center text-center">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 + index * 0.15, type: "spring", stiffness: 300, damping: 18 }}
                className={cn(
                  "grid size-9 place-items-center rounded-full border-2 bg-white text-xs font-semibold",
                  done && !failed && "border-brand-500 bg-brand-500 text-white",
                  done && failed && "border-rose-500 bg-rose-500 text-white",
                  isFailurePoint && "border-rose-500 text-rose-500",
                  !done && !isFailurePoint && "border-slate-300 text-slate-400",
                )}
              >
                {done ? <Check className="size-4" /> : isFailurePoint ? <X className="size-4" /> : index + 1}
              </motion.span>
              <span className={cn("mt-2 text-xs font-medium", done ? "text-slate-900" : "text-slate-400")}>
                {PARCEL_STATUS[step].label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
