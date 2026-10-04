import type { Metadata } from "next";

import { TrackPageShell } from "@/components/track/page-shell";
import { TrackingResult } from "@/components/track/tracking-result";
import { TrackingSearch } from "@/components/track/tracking-search";

export async function generateMetadata(props: PageProps<"/track/[trackingId]">): Promise<Metadata> {
  const { trackingId } = await props.params;
  return { title: `Tracking ${decodeURIComponent(trackingId)}` };
}

export default async function TrackingResultPage(props: PageProps<"/track/[trackingId]">) {
  const { trackingId } = await props.params;
  const id = decodeURIComponent(trackingId).toUpperCase();

  return (
    <TrackPageShell>
      <TrackingSearch className="mx-auto max-w-xl" defaultValue={id} />
      <TrackingResult trackingId={id} />
    </TrackPageShell>
  );
}
