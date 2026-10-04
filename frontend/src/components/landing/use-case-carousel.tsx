"use client";

import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, FileText, Pill, ShoppingBag, ShoppingBasket, UtensilsCrossed, Zap } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

const USE_CASES = [
  {
    icon: ShoppingBag,
    title: "E-commerce",
    text: "Ship online orders from your warehouse and give every buyer a live tracking link.",
    points: ["Tracking ID per order", "Capacity-aware dispatch"],
    gradient: "from-brand-500 to-teal-700",
  },
  {
    icon: Pill,
    title: "Pharmacy",
    text: "Get prescriptions out fast, with a clear record of when each one was picked up and delivered.",
    points: ["Timestamped handovers", "Failed-delivery reporting"],
    gradient: "from-sky-500 to-indigo-700",
  },
  {
    icon: ShoppingBasket,
    title: "Groceries",
    text: "Handle many small, heavy orders by matching each one to the right vehicle and load.",
    points: ["Weight checks per vehicle", "Bikes, vans and trucks"],
    gradient: "from-amber-500 to-orange-700",
  },
  {
    icon: FileText,
    title: "Courier & documents",
    text: "Run same-day courier routes with bikes for small items and vans for everything else.",
    points: ["Mixed fleet support", "Driver status updates"],
    gradient: "from-violet-500 to-purple-800",
  },
  {
    icon: UtensilsCrossed,
    title: "Restaurants",
    text: "Keep your own delivery riders organised instead of relying only on third-party apps.",
    points: ["Driver-only views", "Live order status"],
    gradient: "from-rose-500 to-pink-800",
  },
  {
    icon: Zap,
    title: "Electric fleets",
    text: "See battery levels next to every delivery, and plan around charging instead of being surprised by it.",
    points: ["Battery monitoring", "Charging planner (coming soon)"],
    gradient: "from-teal-400 to-cyan-800",
  },
];

export function UseCaseCarousel() {
  const reduceMotion = useReducedMotion();
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start" },
    reduceMotion ? [] : [Autoplay({ delay: 4000, stopOnInteraction: false, stopOnMouseEnter: true })],
  );
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  return (
    <section id="use-cases" className="scroll-mt-20 overflow-hidden bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Use cases</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Built for every kind of delivery
            </h2>
          </Reveal>
          <div className="flex gap-2">
            <CarouselButton onClick={scrollPrev} label="Previous use case">
              <ChevronLeft className="size-5" />
            </CarouselButton>
            <CarouselButton onClick={scrollNext} label="Next use case">
              <ChevronRight className="size-5" />
            </CarouselButton>
          </div>
        </div>

        <div className="mt-12" ref={emblaRef} role="region" aria-roledescription="carousel" aria-label="Use cases">
          <div className="-ml-5 flex touch-pan-y">
            {USE_CASES.map((useCase, index) => (
              <div
                key={useCase.title}
                className="min-w-0 shrink-0 grow-0 basis-[88%] pl-5 sm:basis-1/2 lg:basis-1/3"
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${USE_CASES.length}: ${useCase.title}`}
              >
                <article
                  className={cn(
                    "relative flex h-full min-h-80 flex-col overflow-hidden rounded-3xl bg-linear-to-br p-8 text-white transition-all duration-500",
                    useCase.gradient,
                    index === selected ? "shadow-2xl shadow-slate-300" : "opacity-90",
                  )}
                >
                  <useCase.icon className="absolute -bottom-6 -right-6 size-40 opacity-15" aria-hidden />
                  <span className="grid size-12 place-items-center rounded-2xl bg-white/15 backdrop-blur">
                    <useCase.icon className="size-6" />
                  </span>
                  <h3 className="mt-6 text-2xl font-semibold">{useCase.title}</h3>
                  <p className="mt-3 leading-relaxed text-white/85">{useCase.text}</p>
                  <ul className="mt-auto space-y-1.5 pt-6 text-sm">
                    {useCase.points.map((point) => (
                      <li key={point} className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-white" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-2">
          {USE_CASES.map((useCase, index) => (
            <button
              key={useCase.title}
              onClick={() => emblaApi?.scrollTo(index)}
              aria-label={`Show ${useCase.title}`}
              aria-current={index === selected}
              className="relative h-2 overflow-hidden rounded-full bg-slate-200"
              style={{ width: index === selected ? 32 : 8, transition: "width 0.4s ease" }}
            >
              {index === selected && (
                <motion.span layoutId="carousel-dot" className="absolute inset-0 rounded-full bg-brand-500" />
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function CarouselButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid size-11 place-items-center rounded-full border border-slate-300 text-slate-700 transition hover:border-slate-900 hover:bg-slate-900 hover:text-white active:scale-95"
    >
      {children}
    </button>
  );
}
