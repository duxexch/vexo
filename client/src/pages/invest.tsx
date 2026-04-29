import { Link } from "wouter";
import {
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  Users,
  Shield,
  Coins,
  Crown,
  Globe,
  Zap,
  CheckCircle2,
  Calendar,
  Briefcase,
  Building2,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  MarketingShell,
  SectionEyebrow,
  SectionHeading,
  Reveal,
  GlassCard,
  SpotlightCard,
  BLUE,
  GOLD,
} from "@/components/marketing";

const ALLOC = [
  { key: "dev", value: 35, color: BLUE },
  { key: "marketing", value: 25, color: GOLD },
  { key: "expansion", value: 20, color: "#6366f1" },
  { key: "reserve", value: 12, color: "#22c55e" },
  { key: "research", value: 8, color: "#f43f5e" },
];

export default function InvestPage() {
  const { t, dir } = useI18n();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  const reasons = [
    { icon: TrendingUp, k: "1", color: BLUE },
    { icon: Users, k: "2", color: GOLD },
    { icon: Shield, k: "3", color: BLUE },
    { icon: Coins, k: "4", color: GOLD },
  ];

  const advantages = [
    { icon: Crown, k: "1", color: GOLD },
    { icon: Globe, k: "2", color: BLUE },
    { icon: Zap, k: "3", color: GOLD },
  ];

  return (
    <MarketingShell dir={dir} variant="blue-gold">
      {/* HERO */}
      <section className="pt-4 sm:pt-8">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-10 items-center">
          <div>
            <Reveal>
              <SectionEyebrow color={GOLD}>
                {t("invest.eyebrow")}
              </SectionEyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-6 font-['Bebas_Neue'] text-6xl sm:text-7xl md:text-8xl tracking-wider leading-[0.9]">
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage: `linear-gradient(135deg, #fff 0%, ${GOLD} 60%, ${BLUE} 100%)`,
                  }}
                >
                  {t("invest.title")}
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                {t("invest.subtitle")}
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="font-bold text-black"
                  style={{
                    background: GOLD,
                    boxShadow: `0 12px 40px ${GOLD}50`,
                  }}
                  data-testid="button-invest-book-meeting"
                >
                  <Link href="/support">
                    <Calendar className="me-2 h-4 w-4" />
                    {t("mkt.cta.bookMeeting")}
                    <Arrow className="ms-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-white/[0.04] hover:bg-white/[0.1] text-white"
                >
                  <Link href="/coin">{t("mkt.cta.viewCoin")}</Link>
                </Button>
              </div>
            </Reveal>
          </div>

          {/* Exclusive offer card */}
          <Reveal delay={0.1}>
            <GlassCard className="p-7" glow={GOLD}>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest mb-5">
                <Briefcase className="h-4 w-4" style={{ color: GOLD }} />
                <span style={{ color: GOLD }}>{t("invest.exclusiveOffer")}</span>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    {t("invest.qualifiedOnly")}
                  </div>
                  <div className="font-['Bebas_Neue'] text-3xl tracking-wider mt-1">
                    {t("mkt.exclusive")}
                  </div>
                </div>
                <div className="h-px bg-white/10" />
                {[
                  { l: t("invest.adv.1.title"), v: t("invest.scorecard.rating") },
                  { l: t("invest.adv.2.title"), v: t("invest.scorecard.region") },
                  { l: t("invest.adv.3.title"), v: t("invest.scorecard.tech") },
                ].map((row, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-400">{row.l}</span>
                    <span className="font-bold" style={{ color: GOLD }}>
                      {row.v}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </Reveal>
        </div>
      </section>

      {/* WHY VEX */}
      <section>
        <Reveal>
          <SectionHeading
            title={
              <>
                {t("invest.why.title.a")}{" "}
                <span style={{ color: GOLD }}>{t("invest.why.title.b")}</span>
              </>
            }
            subtitle={t("invest.why.sub")}
            accent={BLUE}
          />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          {reasons.map((r, i) => {
            const Icon = r.icon;
            return (
              <Reveal key={r.k} delay={i * 0.05}>
                <GlassCard className="p-7 h-full" glow={r.color}>
                  <div
                    className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                    style={{
                      background: `${r.color}20`,
                      border: `1px solid ${r.color}40`,
                    }}
                  >
                    <Icon className="h-6 w-6" style={{ color: r.color }} />
                  </div>
                  <h3 className="font-['Bebas_Neue'] text-2xl tracking-wider mb-2">
                    {t("invest.reason." + r.k + ".title")}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t("invest.reason." + r.k + ".desc")}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ALLOCATION */}
      <section>
        <Reveal>
          <SectionHeading
            title={t("invest.alloc.title")}
            subtitle={t("invest.alloc.sub")}
            accent={GOLD}
          />
        </Reveal>
        <Reveal delay={0.05}>
          <GlassCard className="mt-8 p-6 sm:p-8">
            <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 items-center">
              <div className="h-72 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={ALLOC}
                      dataKey="value"
                      nameKey="key"
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="92%"
                      paddingAngle={2}
                      stroke="rgba(0,0,0,0.4)"
                    >
                      {ALLOC.map((a, i) => (
                        <Cell key={i} fill={a.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "rgba(8,12,28,0.92)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12,
                        backdropFilter: "blur(8px)",
                      }}
                      formatter={(v: number) => v + "%"}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {ALLOC.map((a, i) => (
                  <Reveal key={a.key} delay={i * 0.04} y={8}>
                    <div className="flex items-center gap-4">
                      <span
                        className="inline-block w-3 h-3 rounded-full shrink-0"
                        style={{ background: a.color }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold">
                            {t("invest.alloc." + a.key)}
                          </span>
                          <span
                            className="font-['Bebas_Neue'] text-xl tracking-wider"
                            style={{ color: a.color }}
                          >
                            {a.value}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-[width] duration-1000 ease-out"
                            style={{
                              width: a.value + "%",
                              background: a.color,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </section>

      {/* COMPETITIVE ADVANTAGE */}
      <section>
        <Reveal>
          <SectionHeading title={t("invest.adv.title")} accent={BLUE} />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {advantages.map((a, i) => {
            const Icon = a.icon;
            return (
              <Reveal key={a.k} delay={i * 0.06}>
                <GlassCard className="p-7 h-full text-center" glow={a.color}>
                  <div
                    className="mx-auto inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                    style={{
                      background: `${a.color}20`,
                      border: `1px solid ${a.color}40`,
                    }}
                  >
                    <Icon className="h-7 w-7" style={{ color: a.color }} />
                  </div>
                  <h3 className="font-['Bebas_Neue'] text-xl tracking-wider mb-2">
                    {t("invest.adv." + a.k + ".title")}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t("invest.adv." + a.k + ".desc")}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* MILESTONES */}
      <section>
        <Reveal>
          <SectionHeading
            title={t("invest.milestones.title")}
            accent={GOLD}
          />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n, i) => {
            const color = n % 2 ? GOLD : BLUE;
            return (
              <Reveal key={n} delay={i * 0.05}>
                <GlassCard className="p-5 h-full" glow={color}>
                  <div
                    className="font-['Bebas_Neue'] text-5xl tracking-wider mb-2"
                    style={{ color }}
                  >
                    Q{n}
                  </div>
                  <h3 className="text-sm font-bold leading-relaxed">
                    {t("invest.ms." + n + ".title")}
                  </h3>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* COMMITMENT */}
      <section>
        <Reveal>
          <GlassCard className="p-8 sm:p-10">
            <div className="grid lg:grid-cols-[1fr_2fr] gap-8 items-start">
              <div>
                <Building2 className="h-10 w-10 mb-4" style={{ color: GOLD }} />
                <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
                  {t("invest.commit.title")}
                </h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {[1, 2, 3, 4, 5, 6].map((n, i) => (
                  <Reveal key={n} delay={i * 0.04} y={10}>
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        className="h-5 w-5 mt-0.5 shrink-0"
                        style={{ color: i % 2 ? BLUE : GOLD }}
                      />
                      <span className="text-sm text-slate-300">
                        {t("invest.commit." + n)}
                      </span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </section>

      {/* CTA */}
      <section>
        <Reveal>
          <SpotlightCard from="#a06a00" via="#7a4f00" to="#3d2800">
            <h2 className="font-['Bebas_Neue'] text-5xl sm:text-6xl tracking-wider">
              {t("invest.cta.title")}
            </h2>
            <p className="mt-4 text-base sm:text-lg text-amber-100/90 max-w-2xl mx-auto">
              {t("invest.cta.sub")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3 justify-center">
              <Button
                asChild
                size="lg"
                className="font-bold text-black"
                style={{
                  background: GOLD,
                  boxShadow: `0 12px 40px ${GOLD}50`,
                }}
                data-testid="button-invest-final-cta"
              >
                <Link href="/support">
                  <Calendar className="me-2 h-4 w-4" />
                  {t("mkt.cta.bookMeeting")}
                  <Arrow className="ms-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="bg-white/10 border-white/30 hover:bg-white/20 text-white"
              >
                <Link href="/coin">{t("mkt.cta.viewCoin")}</Link>
              </Button>
            </div>
          </SpotlightCard>
        </Reveal>
        <p className="text-center mt-5 text-xs text-slate-500 max-w-3xl mx-auto leading-relaxed">
          {t("invest.disclaimer")}
        </p>
      </section>
    </MarketingShell>
  );
}
