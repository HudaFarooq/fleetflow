import type { Metadata } from "next";

import { TrackPageShell } from "@/components/track/page-shell";
import { TrackingSearch } from "@/components/track/tracking-search";

export const metadata: Metadata = { title: "Track a parcel" };

export default function TrackPage() {
  return (
    <TrackPageShell>
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Track a parcel</h1>
        <p className="mt-3 text-slate-400">Enter the tracking ID you received when the parcel was booked.</p>
      </div>
      <TrackingSearch className="mx-auto mt-8 max-w-xl" />
    </TrackPageShell>
  );
}
