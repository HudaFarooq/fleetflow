const TECH = [
  "Next.js", "TypeScript", "Tailwind CSS", "FastAPI", "PostgreSQL", "SQLAlchemy",
  "JWT auth", "Leaflet maps", "Motion", "TanStack Query", "OR-Tools", "pytest",
];

export function TechMarquee() {
  // The list is rendered twice so the -50% translate loops seamlessly
  return (
    <section aria-label="Technology used" className="border-y border-white/5 bg-ink-950 py-6">
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="flex w-max animate-marquee gap-12 hover:[animation-play-state:paused]">
          {[...TECH, ...TECH].map((name, index) => (
            <span
              key={index}
              aria-hidden={index >= TECH.length}
              className="whitespace-nowrap text-sm font-medium uppercase tracking-[0.2em] text-slate-500"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
