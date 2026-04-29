import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Coins,
  TrendingUp,
  TrendingDown,
  Users,
  Activity,
  Layers,
  ShieldCheck,
  Sparkles,
  ArrowUpRight,
  Flame,
  Globe2,
  Lock,
  Rocket,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { Link } from "wouter";

const BRAND_BLUE = "#1e88ff";
const BRAND_GOLD = "#ffb627";

function formatNumber(n: number, digits = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function buildHistoricalSeries(): { time: string; price: number }[] {
  const points = 60;
  const out: { time: string; price: number }[] = [];
  let p = 0.42;
  const now = Date.now();
  for (let i = points - 1; i >= 0; i--) {
    const t = new Date(now - i * 60 * 60 * 1000);
    p = Math.max(0.01, p * (1 + (Math.random() - 0.46) * 0.04));
    out.push({
      time: `${t.getHours().toString().padStart(2, "0")}:00`,
      price: Number(p.toFixed(4)),
    });
  }
  return out;
}

export default function CoinPage() {
  const { dir } = useI18n();
  const [series] = useState(buildHistoricalSeries);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 7000);
    return () => clearInterval(id);
  }, []);

  const current = series[series.length - 1].price;
  const first = series[0].price;
  const change = ((current - first) / first) * 100;
  const isUp = change >= 0;

  const stats = useMemo(
    () => [
      {
        icon: Coins,
        label: "السعر الحالي",
        value: `$${current.toFixed(4)}`,
        sub: `${isUp ? "+" : ""}${change.toFixed(2)}% آخر ٢٤ ساعة`,
        color: BRAND_GOLD,
      },
      {
        icon: Layers,
        label: "العرض الكلي",
        value: "100M",
        sub: "مقفول من الإصدار",
        color: BRAND_BLUE,
      },
      {
        icon: Activity,
        label: "حجم التداول",
        value: `$${formatNumber(842000 + ((tick * 137) % 12000), 0)}`,
        sub: "آخر ٢٤ ساعة",
        color: "#10b981",
      },
      {
        icon: Users,
        label: "المحافظ النشطة",
        value: `${formatNumber(28419 + ((tick * 11) % 90), 0)}`,
        sub: "نمو مستمر",
        color: "#a855f7",
      },
    ],
    [current, change, isUp, tick],
  );

  const useCases = [
    {
      icon: Wallet,
      title: "وحدة قيمة داخلية",
      desc: "تستخدم لكل المعاملات داخل المنصة: المشاركة في البطولات، شراء الميزات الحصرية، إرسال الهدايا، وتحويلها لباقي المستخدمين فوراً وبدون عمولات وسطاء.",
    },
    {
      icon: Lock,
      title: "إصدار محدود ومحمي",
      desc: "العرض الإجمالي للعملة محدود ومسجَّل في عقد ذكي شفاف. لا يمكن إصدار وحدات إضافية، ما يحافظ على القيمة على المدى الطويل.",
    },
    {
      icon: Sparkles,
      title: "مكافآت يومية وحصرية",
      desc: "احصل على عملات هدية يومياً عبر برامج المكافآت، البطولات، التحديات، وإحالة الأصدقاء. كل مشاركة لها قيمة.",
    },
    {
      icon: ShieldCheck,
      title: "شفافية وأمان كامل",
      desc: "كل عملية صرف وتحويل قابلة للتدقيق. النظام مدعوم بمحفظة باردة ومراقبة ٢٤/٧ لضمان أمان أرصدة المستخدمين.",
    },
  ];

  const milestones = [
    {
      phase: "المرحلة ١",
      title: "إطلاق العملة الداخلية",
      done: true,
      desc: "إطلاق العملة كوحدة قيمة رسمية داخل المنصة، وربطها بنظام البطولات والمكافآت اليومية.",
    },
    {
      phase: "المرحلة ٢",
      title: "ربط محافظ خارجية",
      done: true,
      desc: "دعم سحب وإيداع العملة عبر شركاء معتمدين، وتفعيل تحويلات P2P بين المستخدمين بدون رسوم وسطاء.",
    },
    {
      phase: "المرحلة ٣",
      title: "إدراج في منصات تداول",
      done: false,
      desc: "إدراج العملة في منصات تداول إقليمية وعالمية لتمكين شرائها وبيعها مقابل عملات أخرى بسيولة عالية.",
    },
    {
      phase: "المرحلة ٤",
      title: "نظام Staking للمساهمين",
      done: false,
      desc: "إطلاق برنامج staking يكافئ من يحتفظون بالعملة بنسبة ثابتة ومضافة إلى أرصدتهم تلقائياً.",
    },
  ];

  return (
    <div
      dir={dir}
      className="min-h-[100svh] bg-[#06080f] text-white relative overflow-hidden"
    >
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-[#1e88ff] opacity-20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 w-[500px] h-[500px] rounded-full bg-[#ffb627] opacity-15 blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-12">
        {/* HERO */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-5"
        >
          <Badge
            className="bg-white/5 border border-white/10 text-white/80 px-3 py-1 text-xs"
            variant="outline"
          >
            <Sparkles className="w-3 h-3 me-1.5 inline" />
            عملة المشروع · بثٌّ مباشر
          </Badge>
          <h1
            className="font-['Bebas_Neue'] text-6xl sm:text-7xl md:text-8xl tracking-wider leading-none"
            style={{
              backgroundImage: `linear-gradient(135deg, ${BRAND_BLUE}, ${BRAND_GOLD})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            VEX COIN
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            عملة المشروع الرسمية — وحدة القيمة التي تشغّل كل تجربة داخل VEX
            وتفتح لك أبواب البطولات، الجوائز، والشراكات الحصرية.
          </p>

          {/* Live price ticker */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex flex-wrap items-center justify-center gap-4 mt-6 px-6 py-4 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.03] to-white/[0.01] backdrop-blur"
          >
            <div className="text-left">
              <div className="text-xs text-slate-400 uppercase tracking-wider">
                السعر الآن
              </div>
              <div className="font-['Bebas_Neue'] text-4xl sm:text-5xl text-white tracking-wider leading-none">
                ${current.toFixed(4)}
              </div>
            </div>
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${
                isUp
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
              }`}
            >
              {isUp ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {isUp ? "+" : ""}
              {change.toFixed(2)}%
            </div>
          </motion.div>
        </motion.div>

        {/* CHART */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="bg-gradient-to-b from-[#0f1730]/80 to-[#0a0e1a]/80 border-white/10 backdrop-blur p-5 sm:p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-lg">حركة السعر — ٦٠ ساعة</div>
                <div className="text-xs text-slate-400">
                  بيانات مباشرة من نظام التداول الداخلي
                </div>
              </div>
              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Flame className="w-3 h-3 me-1.5" />
                LIVE
              </Badge>
            </div>
            <div className="h-[280px] sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={series}
                  margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="coinFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND_GOLD} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={BRAND_BLUE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="time"
                    stroke="rgba(255,255,255,0.4)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.4)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0a0e1a",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 12,
                      color: "#fff",
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                    formatter={(v: number) => [`$${v.toFixed(4)}`, "السعر"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={BRAND_GOLD}
                    strokeWidth={2.5}
                    fill="url(#coinFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        {/* STATS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
              >
                <Card className="relative bg-gradient-to-b from-[#10172a] to-[#0a0e1a] border-white/10 p-4 sm:p-5 rounded-xl overflow-hidden h-full">
                  <div
                    className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-20 blur-2xl"
                    style={{ background: s.color }}
                  />
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                    style={{
                      background: `${s.color}22`,
                      color: s.color,
                    }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-xs text-slate-400 mb-1">{s.label}</div>
                  <div className="font-['Bebas_Neue'] text-3xl tracking-wide leading-none">
                    {s.value}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1.5">
                    {s.sub}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* USE CASES */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
              لماذا <span style={{ color: BRAND_GOLD }}>VEX Coin</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">
              عملة مصممة لتشغيل اقتصاد كامل، ليس مجرد رمز
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {useCases.map((u, i) => {
              const Icon = u.icon;
              return (
                <motion.div
                  key={u.title}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.05 * i }}
                >
                  <Card className="group h-full bg-gradient-to-br from-[#10172a] to-[#0a0e1a] border-white/10 p-5 sm:p-6 rounded-2xl hover:border-[#ffb627]/40 transition-all hover:-translate-y-1">
                    <div className="flex items-start gap-4">
                      <div
                        className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${BRAND_BLUE}33, ${BRAND_GOLD}33)`,
                        }}
                      >
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-bold text-lg text-white">
                          {u.title}
                        </h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                          {u.desc}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ROADMAP */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
              خارطة الطريق
            </h2>
            <p className="text-slate-400 text-sm sm:text-base">
              أين نحن، وإلى أين نتجه
            </p>
          </div>

          <div className="relative">
            <div className="absolute right-5 sm:right-6 top-0 bottom-0 w-px bg-gradient-to-b from-[#1e88ff] via-[#ffb627] to-transparent opacity-50" />
            <div className="space-y-5">
              {milestones.map((m, i) => (
                <motion.div
                  key={m.phase}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="relative pr-12 sm:pr-16"
                >
                  <div
                    className={`absolute right-2 sm:right-3 top-2 w-7 h-7 rounded-full border-2 flex items-center justify-center ${
                      m.done
                        ? "border-emerald-400 bg-emerald-500/20"
                        : "border-white/20 bg-[#0a0e1a]"
                    }`}
                  >
                    {m.done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Rocket className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>
                  <Card
                    className={`p-4 sm:p-5 rounded-xl bg-gradient-to-br ${
                      m.done
                        ? "from-emerald-500/10 to-transparent border-emerald-500/30"
                        : "from-[#10172a] to-[#0a0e1a] border-white/10"
                    } border`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="text-[11px] font-bold tracking-widest uppercase"
                        style={{ color: m.done ? "#34d399" : BRAND_BLUE }}
                      >
                        {m.phase}
                      </span>
                      {m.done && (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] py-0">
                          مكتملة
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-bold text-base sm:text-lg text-white">
                      {m.title}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                      {m.desc}
                    </p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-[#1e88ff] via-[#1565c0] to-[#0a3a8c] border-0 p-8 sm:p-12 rounded-3xl text-center">
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-0 left-0 w-72 h-72 rounded-full bg-[#ffb627] blur-[100px]" />
              <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full bg-white blur-[100px]" />
            </div>
            <div className="relative space-y-4">
              <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-[#ffb627] text-black">
                <Coins className="w-7 h-7" />
              </div>
              <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider text-white">
                اشترِ. تداول. اربح.
              </h2>
              <p className="text-white/85 max-w-xl mx-auto text-sm sm:text-base">
                ابدأ رحلتك مع عملة VEX اليوم. سواء كنت لاعباً، مستثمراً، أو
                شريكاً — هنا تجد فرصتك.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-[#ffb627] text-black hover:bg-[#ffb627]/90 font-bold text-base px-8 h-12 rounded-xl shadow-xl"
                >
                  <Link href="/wallet">
                    <Wallet className="w-4 h-4 me-2" />
                    افتح محفظتي
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/40 text-white hover:bg-white/10 font-bold text-base px-8 h-12 rounded-xl bg-transparent"
                >
                  <Link href="/p2p">
                    <Globe2 className="w-4 h-4 me-2" />
                    تداول P2P
                    <ArrowUpRight className="w-4 h-4 ms-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>

        <div className="text-center text-[11px] text-slate-500 pt-2">
          الأسعار المعروضة لأغراض إعلامية. التداول الفعلي يتم عبر النظام
          الرسمي للمنصة.
        </div>
      </div>
    </div>
  );
}
