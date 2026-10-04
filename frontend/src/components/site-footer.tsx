import Link from "next/link";

import { Logo } from "@/components/ui/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink-950 text-slate-400">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Logo dark />
          <p className="text-sm">Parcel delivery and fleet management, in one live view.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/track" className="hover:text-white">Track a parcel</Link>
          <Link href="/login" className="hover:text-white">Log in</Link>
          <Link href="/register" className="hover:text-white">Create account</Link>
        </nav>
      </div>
      <div className="border-t border-white/5 py-5 text-center text-xs text-slate-500">
        Built with Next.js, FastAPI and PostgreSQL
      </div>
    </footer>
  );
}
