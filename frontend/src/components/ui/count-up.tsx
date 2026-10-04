"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/** Counts up to `value` when it scrolls into view, then animates between later values. */
export function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const inView = useInView(ref, { once: true });
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return;
    const render = (number: number) => {
      shown.current = number;
      node.textContent = `${Math.round(number).toLocaleString()}${suffix}`;
    };
    if (reduceMotion) {
      render(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: render,
    });
    return () => controls.stop();
  }, [inView, value, suffix, reduceMotion]);

  return (
    <span ref={ref} className="tabular-nums">
      0{suffix}
    </span>
  );
}
