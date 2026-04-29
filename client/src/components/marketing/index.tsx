import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

const BLUE = "#1e88ff";
const GOLD = "#ffb627";

/* ----------------------------- AnimatedShell ----------------------------- */
export function MarketingShell({
  children,
  dir,
  variant = "blue-gold",
}: {
  children: ReactNode;
  dir: "ltr" | "rtl";
  variant?: "blue-gold" | "gold-blue" | "gold" | "blue";
}) {
  const palettes: Record<string, [string, string]> = {
    "blue-gold": [BLUE, GOLD],
    "gold-blue": [GOLD, BLUE],
    gold: [GOLD, "#ffd86b"],
    blue: [BLUE, "#6dd5ff"],
  };
  const [a, b] = palettes[variant];
  return (
    <div
      dir={dir}
      className="min-h-[100svh] bg-[#04060c] text-white relative overflow-hidden"
    >
      {/* Mesh gradient base */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(60% 40% at 12% 0%, ${a}30 0%, transparent 60%), radial-gradient(60% 40% at 88% 30%, ${b}30 0%, transparent 60%), radial-gradient(70% 50% at 50% 100%, ${a}20 0%, transparent 70%)`,
        }}
      />
      {/* Animated grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 80%)",
        }}
      />
      {/* Floating orbs */}
      <motion.div
        className="pointer-events-none absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full blur-[120px]"
        style={{ background: a, opacity: 0.22 }}
        animate={{ x: [0, 25, 0], y: [0, 18, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute top-1/2 -left-32 w-[460px] h-[460px] rounded-full blur-[120px]"
        style={{ background: b, opacity: 0.18 }}
        animate={{ x: [0, -22, 0], y: [0, -16, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Noise grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-16 sm:space-y-20">
        {children}
      </div>
    </div>
  );
}

/* ---------------------------- Section header ---------------------------- */
export function SectionEyebrow({
  children,
  color = BLUE,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-bold tracking-[0.25em] uppercase"
      style={{ color }}
    >
      <span
        className="inline-block w-6 h-[1.5px]"
        style={{ background: color }}
      />
      {children}
      <span
        className="inline-block w-6 h-[1.5px]"
        style={{ background: color }}
      />
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  accent = GOLD,
  align = "center",
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={cn(
        "space-y-3",
        align === "center" ? "text-center mx-auto max-w-2xl" : "text-start",
      )}
    >
      {eyebrow && <SectionEyebrow color={accent}>{eyebrow}</SectionEyebrow>}
      <h2 className="font-display text-4xl sm:text-5xl md:text-6xl tracking-wider leading-[0.95]">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* -------------------------- RevealOnScroll ------------------------------ */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------ Counter --------------------------------- */
export function Counter({
  to,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.6,
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const sp = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (inView) mv.set(to);
  }, [inView, mv, to]);
  useEffect(() => sp.on("change", (v) => setVal(v)), [sp]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {val.toLocaleString("en-US", {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* ---------------------------- GlassCard --------------------------------- */
export function GlassCard({
  children,
  className,
  hoverable = true,
  glow,
  style,
}: {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
  glow?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-xl overflow-hidden",
        hoverable &&
          "transition-all duration-300 hover:-translate-y-1 hover:border-white/20",
        className,
      )}
      style={style}
    >
      {glow && (
        <div
          className="pointer-events-none absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl opacity-30"
          style={{ background: glow }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/* ---------------------------- Spotlight CTA ----------------------------- */
export function SpotlightCard({
  children,
  className,
  from = BLUE,
  via = "#1565c0",
  to = "#0a3a8c",
}: {
  children: ReactNode;
  className?: string;
  from?: string;
  via?: string;
  to?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl p-8 sm:p-12 text-center",
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${from}, ${via}, ${to})`,
      }}
    >
      {/* Shimmer */}
      <motion.div
        className="pointer-events-none absolute -inset-x-1/2 -top-1/2 h-[200%] w-[200%]"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.12) 30deg, transparent 60deg)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-0 left-0 w-72 h-72 rounded-full blur-[100px] bg-brand-gold" />
        <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full blur-[100px] bg-white" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/* ---------------------------- Marquee --------------------------------- */
export function Marquee({
  items,
  speed = 35,
}: {
  items: { label: string; value: string }[];
  speed?: number;
}) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-white/10 py-4 bg-white/[0.015]">
      <motion.div
        className="flex gap-12 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
      >
        {doubled.map((it, i) => (
          <div key={i} className="flex items-center gap-3 shrink-0">
            <span className="font-display text-2xl tracking-wider text-brand-gold">
              {it.value}
            </span>
            <span className="text-xs uppercase tracking-widest text-slate-400">
              {it.label}
            </span>
            <span className="text-slate-700 text-2xl">·</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export { BLUE, GOLD };
