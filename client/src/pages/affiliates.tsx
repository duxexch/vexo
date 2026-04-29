import { Link } from "wouter";
import {
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  BarChart3,
  Wallet,
  Shield,
  Youtube,
  Megaphone,
  Users,
  Link2,
  Send,
  Trophy,
  Coins,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  MarketingShell,
  SectionEyebrow,
  SectionHeading,
  Reveal,
  GlassCard,
  SpotlightCard,
  Marquee,
  BLUE,
  GOLD,
} from "@/components/marketing";

export default function AffiliatesPage() {
  const { t, dir } = useI18n();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  const benefits = [
    { icon: TrendingUp, k: "1", color: BLUE },
    { icon: BarChart3, k: "2", color: GOLD },
    { icon: Wallet, k: "3", color: BLUE },
    { icon: Shield, k: "4", color: GOLD },
  ];

  const audience = [
    { icon: Youtube, k: "1", color: GOLD },
    { icon: Megaphone, k: "2", color: BLUE },
    { icon: Users, k: "3", color: GOLD },
  ];

  const stepIcons = [Sparkles, Link2, Send, Trophy];

  return (
    <MarketingShell dir={dir} variant="blue">
      {/* HERO */}
      <section className="pt-4 sm:pt-8 text-center">
        <Reveal>
          <SectionEyebrow color={BLUE}>{t("aff.eyebrow")}</SectionEyebrow>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="mt-6 font-display text-6xl sm:text-7xl md:text-8xl tracking-wider leading-[0.9]">
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(135deg, #fff 0%, ${BLUE} 60%, ${GOLD} 100%)`,
              }}
            >
              {t("aff.title")}
            </span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
            {t("aff.subtitle")}
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-7 flex flex-wrap gap-3 justify-center">
            <Button
              asChild
              size="lg"
              className="font-bold text-white"
              style={{ background: BLUE, boxShadow: `0 12px 40px ${BLUE}50` }}
              data-testid="button-aff-get-link"
            >
              <Link href="/referral">
                <Link2 className="me-2 h-4 w-4" />
                {t("mkt.cta.getMyLink")}
                <Arrow className="ms-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/20 bg-white/[0.04] hover:bg-white/[0.1] text-white"
            >
              <Link href="/support">{t("mkt.cta.beAgent")}</Link>
            </Button>
          </div>
        </Reveal>

        {/* Hero stats */}
        <Reveal delay={0.2}>
          <div className="mt-10 grid grid-cols-3 gap-3 sm:gap-6 max-w-2xl mx-auto">
            {[
              { v: t("aff.stats.support"), l: t("aff.stats.supportLabel"), c: BLUE },
              { v: t("aff.stats.invites"), l: t("aff.stats.invitesLabel"), c: GOLD },
              { v: t("aff.stats.fees"), l: t("aff.stats.feesLabel"), c: BLUE },
            ].map((s, i) => (
              <GlassCard key={i} className="p-4 sm:p-5 text-center">
                <div
                  className="font-display text-3xl sm:text-4xl tracking-wider"
                  style={{ color: s.c }}
                >
                  {s.v}
                </div>
                <div className="mt-1 text-[10px] sm:text-xs uppercase tracking-widest text-slate-400">
                  {s.l}
                </div>
              </GlassCard>
            ))}
          </div>
        </Reveal>
      </section>

      <Marquee
        items={[
          { value: "0%", label: t("aff.stats.feesLabel") },
          { value: "24/7", label: t("aff.stats.supportLabel") },
          { value: "∞", label: t("aff.stats.invitesLabel") },
          { value: "VEX", label: t("aff.benefit.1.title") },
        ]}
      />

      {/* BENEFITS */}
      <section>
        <Reveal>
          <SectionHeading
            title={
              <>
                {t("aff.benefits.title.a")}{" "}
                <span style={{ color: GOLD }}>{t("aff.benefits.title.b")}</span>
              </>
            }
            subtitle={t("aff.benefits.sub")}
            accent={BLUE}
          />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          {benefits.map((b, i) => {
            const Icon = b.icon;
            return (
              <Reveal key={b.k} delay={i * 0.05}>
                <GlassCard className="p-7 h-full" glow={b.color}>
                  <div
                    className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                    style={{
                      background: `${b.color}20`,
                      border: `1px solid ${b.color}40`,
                    }}
                  >
                    <Icon className="h-6 w-6" style={{ color: b.color }} />
                  </div>
                  <h3 className="font-display text-2xl tracking-wider mb-2">
                    {t("aff.benefit." + b.k + ".title")}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t("aff.benefit." + b.k + ".desc")}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* STEPS */}
      <section>
        <Reveal>
          <SectionHeading
            title={t("aff.steps.title")}
            subtitle={t("aff.steps.sub")}
            accent={GOLD}
          />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((n, i) => {
            const color = n % 2 ? BLUE : GOLD;
            const Icon = stepIcons[i];
            return (
              <Reveal key={n} delay={i * 0.06}>
                <GlassCard className="p-6 h-full" glow={color}>
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="grid place-items-center w-12 h-12 rounded-xl"
                      style={{
                        background: `${color}20`,
                        border: `1px solid ${color}40`,
                      }}
                    >
                      <Icon className="h-5 w-5" style={{ color }} />
                    </div>
                    <span
                      className="font-display text-4xl tracking-wider opacity-30"
                      style={{ color }}
                    >
                      0{n}
                    </span>
                  </div>
                  <h3 className="font-display text-xl tracking-wider mb-2">
                    {t("aff.step." + n + ".title")}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t("aff.step." + n + ".desc")}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* AUDIENCE */}
      <section>
        <Reveal>
          <SectionHeading title={t("aff.audience.title")} accent={BLUE} />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {audience.map((a, i) => {
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
                  <h3 className="font-display text-xl tracking-wider mb-2">
                    {t("aff.audience." + a.k + ".title")}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t("aff.audience." + a.k + ".desc")}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* DIFFERENTIATORS */}
      <section>
        <Reveal>
          <GlassCard className="p-8 sm:p-10">
            <div className="grid lg:grid-cols-[1fr_2fr] gap-8 items-start">
              <div>
                <SectionEyebrow color={GOLD}>{t("mkt.brand.eyebrow")}</SectionEyebrow>
                <h2 className="mt-4 font-display text-4xl sm:text-5xl tracking-wider">
                  {t("aff.diff.title")}
                </h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {[1, 2, 3, 4, 5, 6].map((n, i) => (
                  <Reveal key={n} delay={i * 0.04} y={10}>
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        className="h-5 w-5 mt-0.5 shrink-0"
                        style={{ color: i % 2 ? GOLD : BLUE }}
                      />
                      <span className="text-sm text-slate-300">
                        {t("aff.diff." + n)}
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
          <SpotlightCard from={BLUE} via="#1565c0" to="#0a3a8c">
            <h2 className="font-display text-5xl sm:text-6xl tracking-wider">
              {t("aff.cta.title")}
            </h2>
            <p className="mt-4 text-base sm:text-lg text-blue-100 max-w-2xl mx-auto">
              {t("aff.cta.sub")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3 justify-center">
              <Button
                asChild
                size="lg"
                className="font-bold text-black"
                style={{ background: GOLD, boxShadow: `0 12px 40px ${GOLD}50` }}
                data-testid="button-aff-final-cta"
              >
                <Link href="/referral">
                  <Coins className="me-2 h-4 w-4" />
                  {t("mkt.cta.getMyLink")}
                  <Arrow className="ms-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="bg-white/10 border-white/30 hover:bg-white/20 text-white"
              >
                <Link href="/support">{t("mkt.cta.beAgent")}</Link>
              </Button>
            </div>
          </SpotlightCard>
        </Reveal>
      </section>
    </MarketingShell>
  );
}
