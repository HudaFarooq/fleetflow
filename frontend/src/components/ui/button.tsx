import { LoaderCircle } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-brand-500 text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600 hover:shadow-brand-500/40",
  dark: "bg-ink-900 text-white hover:bg-ink-800",
  outline: "border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  glass: "border border-white/15 bg-white/5 text-white backdrop-blur hover:bg-white/10",
  danger: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
};

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

type StyleProps = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
};

function buttonClasses({ variant = "primary", size = "md", className }: StyleProps) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200",
    "active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
    "disabled:pointer-events-none disabled:opacity-60",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  loading,
  children,
  ...props
}: StyleProps & React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button className={buttonClasses({ variant, size, className })} disabled={loading || props.disabled} {...props}>
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: StyleProps & React.ComponentProps<typeof Link>) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}
