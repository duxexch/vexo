import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  Coins,
  Lock,
  Shield,
  Sparkles,
  Wallet,
  Activity,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  MarketingShell,
  SectionEyebrow,
  SectionHeading,
  Reveal,
  Counter,
  GlassCard,
  SpotlightCard,
  Marquee,
  BLUE,
  GOLD,
} from "@/components/marketing";

const BASE_PRICE = 0.42;

function generateSeries() {
  const now = Date.now();
  const out: { t: number; p: number; label: string }[] = [];
  let p = BASE_PRICE * 0.93;
  for (let i = 60; i >= 0; i--) {
    const t = now - i * 3600 * 1000;
    p += (Math.random() - 0.45) * 0.012;
    p = Math.max(BASE_PRICE * 0.85, Math.min(BASE_PRICE * 1.18, p));
    out.push({
      t,
      p: Number(p.toFixed(4)),
      label: new Date(t).getHours() + ":00",
    });
  }
  return out;
}

export default function CoinPage() {
  const { t, dir } = useI18n();
  const [series, setSeries] = useState(() => generateSeries());

  useEffect(() => {
    const id = setInterval(() => {
      setSeries((s) => {
        const last = s[s.length - 1].p;
        const next = Math.max(
          BASE_PRICE * 0.85,
          Math.min(BASE_PRICE * 1.18, last + (Math.random() - 0.45) * 0.008),
        );
        return [
          ...s.slice(1),
          {
            t: Date.now(),
            p: Number(next.toFixed(4)),
            label: new Date().getHours() + ":00",
          },
        ];
      });
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const current = series[series.length - 1].p;
  const oldest = series[0].p;
  const delta = ((current - oldest) / oldest) * 100;
  const positive = delta >= 0;
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  const useCases = useMemo(
    () => [
      { icon: Coins, k: "1", color: BLUE },
      { icon: Lock, k: "2", color: GOLD },
      { icon: Sparkles, k: "3", color: BLUE },
      { icon: Shield, k: "4", color: GOLD },
    ],
    [],
  );

  const roadmap = useMemo(
    () => [
      { k: "1", color: BLUE, status: t("mkt.completed") },
      { k: "2", color: GOLD, status: t("mkt.upcoming") },
      { k: "3", color: BLUE, status: t("mkt.upcoming") },
      { k: "4", color: GOLD, status: t("mkt.upcoming") },
    ],
    [t],
  );

  return (
    <MarketingShell dir={dir} variant="blue-gold">
      {/* HERO ─────────────────────────────────────────────── */}
      <section className="pt-4 sm:pt-8">
        <Reveal>
          <SectionEyebrow color={BLUE}>{t("coin.eyebrow")}</SectionEyebrow>
        </Reveal>
        <div className="mt-6 grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <Reveal delay={0.05}>
            <h1 className="font-['Bebas_Neue'] text-6xl sm:text-7xl md:text-8xl tracking-wider leading-[0.9]">
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: `linear-gradient(135deg, #fff 0%, ${GOLD} 60%, ${BLUE} 100%)`,
                }}
              >
                {t("coin.title")}
              </span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
              {t("coin.subtitle")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="font-bold text-black shadow-2xl"
                style={{ background: GOLD, boxShadow: `0 12px 40px ${GOLD}40` }}
                data-testid="button-coin-cta-primary"
              >
                <Link href="/wallet">
                  <Wallet className="me-2 h-4 w-4" />
                  {t("mkt.cta.primary.coin")}
                  <Arrow className="ms-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/20 bg-white/[0.04] hover:bg-white/[0.1] text-white"
                data-testid="button-coin-cta-secondary"
              >
                <Link href="/p2p">{t("mkt.cta.secondary.coin")}</Link>
              </Button>
            </div>
          </Reveal>

          {/* Live price card */}
          <Reveal delay={0.1}>
            <GlassCard glow={positive ? BLUE : "#ff5252"} className="p-7">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 text-slate-400 uppercase tracking-widest">
                  <span
                    className="inline-block w-2 h-2 rounded-full animate-pulse"
                    style={{ background: positive ? "#22c55e" : "#ef4444" }}
                  />
                  {t("mkt.live")}
                </span>
                <span className="text-slate-500">{t("coin.priceNow")}</span>
              </div>
              <div className="mt-3 font-['Bebas_Neue'] text-6xl tracking-wider">
                $<Counter to={current} decimals={4} duration={1.2} />
              </div>
              <div
                className="mt-1 inline-flex items-center gap-1 text-sm font-bold"
                style={{ color: positive ? "#22c55e" : "#ef4444" }}
              >
                <TrendingUp
                  className={"h-4 w-4 " + (positive ? "" : "rotate-180")}
                />
                {positive ? "+" : ""}
                {delta.toFixed(2)}% · {t("coin.last24h")}
              </div>
              <div className="mt-4 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="liveG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={positive ? "#22c55e" : "#ef4444"} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={positive ? "#22c55e" : "#ef4444"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="p"
                      stroke={positive ? "#22c55e" : "#ef4444"}
                      strokeWidth={1.8}
                      fill="url(#liveG)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </Reveal>
        </div>
      </section>

      {/* MARQUEE STATS BAR ─────────────────────────────────── */}
      <Marquee
        items={[
          { value: "$" + current.toFixed(4), label: t("coin.stat.price") },
          { value: "100M", label: t("coin.stat.supply") },
          { value: "$2.4M", label: t("coin.stat.volume") },
          { value: "12,847", label: t("coin.stat.wallets") },
          { value: (positive ? "+" : "") + delta.toFixed(2) + "%", label: t("coin.last24h") },
        ]}
      />

      {/* MAIN CHART ────────────────────────────────────────── */}
      <section>
        <Reveal>
          <SectionHeading
            eyebrow={t("coin.chart.title")}
            title={
              <>
                {t("coin.why.title.a")}{" "}
                <span style={{ color: GOLD }}>{t("coin.why.title.b")}</span>
              </>
            }
            subtitle={t("coin.chart.sub")}
            accent={BLUE}
          />
        </Reveal>

        <Reveal delay={0.1}>
          <GlassCard className="mt-8 p-4 sm:p-8">
            <div className="h-72 sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="bigG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GOLD} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    stroke="rgba(255,255,255,0.3)"
                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                    interval={Math.floor(series.length / 8)}
                    reversed={dir === "rtl"}
                  />
                  <YAxis
                    domain={["dataMin - 0.005", "dataMax + 0.005"]}
                    stroke="rgba(255,255,255,0.3)"
                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                    orientation={dir === "rtl" ? "right" : "left"}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(8,12,28,0.92)",
                      border: `1px solid ${GOLD}40`,
                      borderRadius: 12,
                      color: "#fff",
                      backdropFilter: "blur(8px)",
                    }}
                    formatter={(v: number) => "$" + v.toFixed(4)}
                  />
                  <Area
                    type="monotone"
                    dataKey="p"
                    stroke={GOLD}
                    strokeWidth={2.5}
                    fill="url(#bigG)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </Reveal>
      </section>

      {/* STATS GRID ────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { k: "price", v: current, prefix: "$", dec: 4, icon: TrendingUp, color: GOLD },
          { k: "supply", v: 100, suffix: "M", dec: 0, icon: Coins, color: BLUE },
          { k: "volume", v: 2.4, prefix: "$", suffix: "M", dec: 1, icon: Activity, color: GOLD },
          { k: "wallets", v: 12847, dec: 0, icon: Wallet, color: BLUE },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <Reveal key={s.k} delay={i * 0.05}>
              <GlassCard className="p-5 h-full" glow={s.color}>
                <Icon className="h-7 w-7 mb-3" style={{ color: s.color }} />
                <div className="font-['Bebas_Neue'] text-3xl sm:text-4xl tracking-wider">
                  <Counter
                    to={s.v}
                    prefix={s.prefix || ""}
                    suffix={s.suffix || ""}
                    decimals={s.dec}
                  />
                </div>
                <div className="mt-1 text-xs uppercase tracking-widest text-slate-400">
                  {t("coin.stat." + s.k)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t("coin.stat." + s.k + "Sub")}
                </div>
              </GlassCard>
            </Reveal>
          );
        })}
      </section>

      {/* WHY COIN ──────────────────────────────────────────── */}
      <section>
        <Reveal>
          <SectionHeading
            eyebrow={t("coin.why.eyebrow")}
            title={
              <>
                {t("coin.why.title.a")}{" "}
                <span style={{ color: GOLD }}>{t("coin.why.title.b")}</span>?
              </>
            }
            subtitle={t("coin.why.sub")}
            accent={BLUE}
          />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          {useCases.map((u, i) => {
            const Icon = u.icon;
            return (
              <Reveal key={u.k} delay={i * 0.06}>
                <GlassCard className="p-7 h-full" glow={u.color}>
                  <div
                    className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                    style={{
                      background: `${u.color}20`,
                      border: `1px solid ${u.color}40`,
                    }}
                  >
                    <Icon className="h-6 w-6" style={{ color: u.color }} />
                  </div>
                  <h3 className="font-['Bebas_Neue'] text-2xl tracking-wider mb-2">
                    {t("coin.use." + u.k + ".title")}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t("coin.use." + u.k + ".desc")}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ROADMAP ───────────────────────────────────────────── */}
      <section>
        <Reveal>
          <SectionHeading
            title={t("coin.road.title")}
            subtitle={t("coin.road.sub")}
            accent={GOLD}
          />
        </Reveal>
        <div className="mt-10 relative">
          {/* Vertical line */}
          <div
            className="absolute top-0 bottom-0 w-px ms-7 sm:ms-8"
            style={{
              background:
                "linear-gradient(to bottom, transparent, rgba(255,255,255,0.15), transparent)",
            }}
          />
          <div className="space-y-5">
            {roadmap.map((r, i) => (
              <Reveal key={r.k} delay={i * 0.07}>
                <div className="flex gap-4 sm:gap-5 items-start">
                  <div
                    className="shrink-0 grid place-items-center w-14 h-14 sm:w-16 sm:h-16 rounded-full font-['Bebas_Neue'] text-2xl tracking-wider relative z-10"
                    style={{
                      background: `${r.color}20`,
                      border: `2px solid ${r.color}`,
                      color: r.color,
                      boxShadow: `0 0 30px ${r.color}40`,
                    }}
                  >
                    {r.k}
                  </div>
                  <GlassCard className="flex-1 p-5">
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                        style={{
                          background: `${r.color}20`,
                          color: r.color,
                        }}
                      >
                        {t("coin.road." + r.k + ".phase")}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-slate-500">
                        {r.status}
                      </span>
                    </div>
                    <h3 className="font-['Bebas_Neue'] text-2xl tracking-wider mb-2">
                      {t("coin.road." + r.k + ".title")}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {t("coin.road." + r.k + ".desc")}
                    </p>
                  </GlassCard>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA ─────────────────────────────────────────── */}
      <section>
        <Reveal>
          <SpotlightCard from={BLUE} via="#1565c0" to="#0a3a8c">
            <h2 className="font-['Bebas_Neue'] text-5xl sm:text-6xl tracking-wider">
              {t("coin.cta.title")}
            </h2>
            <p className="mt-4 text-base sm:text-lg text-blue-100 max-w-2xl mx-auto">
              {t("coin.cta.sub")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3 justify-center">
              <Button
                asChild
                size="lg"
                className="font-bold text-black"
                style={{ background: GOLD, boxShadow: `0 12px 40px ${GOLD}50` }}
                data-testid="button-coin-final-cta"
              >
                <Link href="/wallet">
                  <Wallet className="me-2 h-4 w-4" />
                  {t("mkt.cta.primary.coin")}
                  <Arrow className="ms-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="bg-white/10 border-white/30 hover:bg-white/20 text-white"
              >
                <Link href="/p2p">{t("mkt.cta.secondary.coin")}</Link>
              </Button>
            </div>
          </SpotlightCard>
        </Reveal>
        <p className="text-center mt-5 text-xs text-slate-500 max-w-2xl mx-auto">
          {t("coin.disclaimer")}
        </p>
      </section>
    </MarketingShell>
  );
}
