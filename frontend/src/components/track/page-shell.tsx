import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** Dark header band with a light content area, shared by the tracking pages. */
export function TrackPageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="relative overflow-hidden bg-ink-950 pb-36 pt-40">
          <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
          <div className="absolute -top-20 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-brand-500/20 blur-[120px]" />
        </div>
        <div className="relative mx-auto -mt-44 max-w-3xl px-4 pb-24 sm:px-6">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
