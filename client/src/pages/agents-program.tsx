import { Link } from "wouter";
import {
  ArrowRight,
  ArrowLeft,
  Crown,
  Wallet,
  Shield,
  Headphones,
  Award,
  TrendingUp,
  Globe,
  BarChart3,
  Send,
  Zap,
  CheckCircle2,
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

export default function AgentsProgramPage() {
  const { t, dir } = useI18n();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  const benefits = [
    { icon: Crown, k: "1", color: GOLD },
    { icon: Award, k: "2", color: BLUE },
    { icon: Wallet, k: "3", color: GOLD },
    { icon: Headphones, k: "4", color: BLUE },
    { icon: Shield, k: "5", color: GOLD },
    { icon: TrendingUp, k: "6", color: BLUE },
  ];

  const tools = [
    { icon: BarChart3, k: "1", color: BLUE },
    { icon: Send, k: "2", color: GOLD },
    { icon: Globe, k: "3", color: BLUE },
  ];

  const promises = [1, 2, 3, 4, 5, 6];

  return (
    <MarketingShell dir={dir} variant="gold-blue">
      {/* HERO ─────────────────────────────────────────────── */}
      <section className="pt-4 sm:pt-8 text-center">
        <Reveal>
          <SectionEyebrow color={GOLD}>{t("agents.eyebrow")}</SectionEyebrow>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="mt-6 font-display text-6xl sm:text-7xl md:text-8xl tracking-wider leading-[0.9]">
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(135deg, #fff 0%, ${GOLD} 100%)`,
              }}
            >
              {t("agents.title")}
            </span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
            {t("agents.subtitle")}
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-7 flex flex-wrap gap-3 justify-center">
            <Button
              asChild
              size="lg"
              className="font-bold text-black"
              style={{ background: GOLD, boxShadow: `0 12px 40px ${GOLD}50` }}
              data-testid="button-agents-apply"
            >
              <Link href="/support">
                <Zap className="me-2 h-4 w-4" />
                {t("mkt.cta.applyAgent")}
                <Arrow className="ms-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/20 bg-white/[0.04] hover:bg-white/[0.1] text-white"
            >
              <Link href="/support">{t("mkt.cta.contactAdmin")}</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      <Marquee
        items={[
          { value: "100%", label: t("agents.benefit.5.title") },
          { value: "24/7", label: t("agents.benefit.4.title") },
          { value: "x", label: t("agents.benefit.6.title") },
          { value: "∞", label: t("agents.benefit.1.title") },
          { value: "VEX", label: t("agents.benefit.2.title") },
        ]}
      />

      {/* BENEFITS ─────────────────────────────────────────── */}
      <section>
        <Reveal>
          <SectionHeading
            eyebrow={t("agents.benefits.eyebrow")}
            title={
              <>
                {t("agents.benefits.title.a")}{" "}
                <span style={{ color: GOLD }}>
                  {t("agents.benefits.title.b")}
                </span>
              </>
            }
            subtitle={t("agents.benefits.sub")}
            accent={GOLD}
          />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
                    {t("agents.benefit." + b.k + ".title")}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t("agents.benefit." + b.k + ".desc")}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* STEPS ───────────────────────────────────────────── */}
      <section>
        <Reveal>
          <SectionHeading
            title={t("agents.steps.title")}
            subtitle={t("agents.steps.sub")}
            accent={BLUE}
          />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((n, i) => {
            const color = n % 2 ? GOLD : BLUE;
            return (
              <Reveal key={n} delay={i * 0.06}>
                <GlassCard className="p-6 h-full relative" glow={color}>
                  <div
                    className="font-display text-7xl leading-none opacity-20 absolute top-2 end-3"
                    style={{ color }}
                  >
                    {n}
                  </div>
                  <div className="relative">
                    <div
                      className="text-xs font-bold uppercase tracking-widest mb-3"
                      style={{ color }}
                    >
                      0{n}
                    </div>
                    <h3 className="font-display text-xl tracking-wider mb-2">
                      {t("agents.step." + n + ".title")}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {t("agents.step." + n + ".desc")}
                    </p>
                  </div>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* TOOLS ───────────────────────────────────────────── */}
      <section>
        <Reveal>
          <SectionHeading
            title={t("agents.tools.title")}
            subtitle={t("agents.tools.sub")}
            accent={GOLD}
          />
        </Reveal>
        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {tools.map((tool, i) => {
            const Icon = tool.icon;
            return (
              <Reveal key={tool.k} delay={i * 0.06}>
                <GlassCard className="p-7 h-full text-center" glow={tool.color}>
                  <div
                    className="mx-auto inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                    style={{
                      background: `${tool.color}20`,
                      border: `1px solid ${tool.color}40`,
                    }}
                  >
                    <Icon className="h-7 w-7" style={{ color: tool.color }} />
                  </div>
                  <h3 className="font-display text-xl tracking-wider mb-2">
                    {t("agents.tool." + tool.k + ".title")}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t("agents.tool." + tool.k + ".desc")}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* PROMISE ────────────────────────────────────────── */}
      <section>
        <Reveal>
          <GlassCard className="p-8 sm:p-10">
            <div className="grid lg:grid-cols-[1fr_2fr] gap-8 items-start">
              <div>
                <SectionEyebrow color={GOLD}>{t("mkt.brand.eyebrow")}</SectionEyebrow>
                <h2 className="mt-4 font-display text-4xl sm:text-5xl tracking-wider">
                  {t("agents.promise.title")}
                </h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {promises.map((p, i) => (
                  <Reveal key={p} delay={i * 0.04} y={10}>
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        className="h-5 w-5 mt-0.5 shrink-0"
                        style={{ color: i % 2 ? BLUE : GOLD }}
                      />
                      <span className="text-sm text-slate-300">
                        {t("agents.promise." + p)}
                      </span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </section>

      {/* CTA ──────────────────────────────────────────────── */}
      <section>
        <Reveal>
          <SpotlightCard from="#a06a00" via="#7a4f00" to="#3d2800">
            <h2 className="font-display text-5xl sm:text-6xl tracking-wider">
              {t("agents.cta.title")}
            </h2>
            <p className="mt-4 text-base sm:text-lg text-amber-100/90 max-w-2xl mx-auto">
              {t("agents.cta.sub")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3 justify-center">
              <Button
                asChild
                size="lg"
                className="font-bold text-black"
                style={{ background: GOLD, boxShadow: `0 12px 40px ${GOLD}50` }}
                data-testid="button-agents-final-cta"
              >
                <Link href="/support">
                  <Zap className="me-2 h-4 w-4" />
                  {t("mkt.cta.applyAgent")}
                  <Arrow className="ms-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="bg-white/10 border-white/30 hover:bg-white/20 text-white"
              >
                <Link href="/support">{t("mkt.cta.contactAdmin")}</Link>
              </Button>
            </div>
            <p className="mt-5 text-xs text-amber-100/60">
              {t("agents.cta.note")}
            </p>
          </SpotlightCard>
        </Reveal>
      </section>
    </MarketingShell>
  );
}
