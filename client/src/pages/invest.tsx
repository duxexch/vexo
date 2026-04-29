import { motion } from "framer-motion";
import {
  Building2,
  TrendingUp,
  Users,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
  PieChart as PieIcon,
  Zap,
  Globe2,
  Trophy,
  Lock,
  Eye,
  Mail,
  Calendar,
  CheckCircle2,
  Briefcase,
  Coins,
  Gem,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { Link } from "wouter";

const BLUE = "#1e88ff";
const GOLD = "#ffb627";

const ALLOC_DATA = [
  { name: "تطوير المنصة", value: 35, color: BLUE },
  { name: "التسويق والنمو", value: 25, color: GOLD },
  { name: "التوسع الإقليمي", value: 20, color: "#10b981" },
  { name: "احتياطي تشغيلي", value: 12, color: "#a855f7" },
  { name: "بحث وابتكار", value: 8, color: "#ec4899" },
];

export default function InvestPage() {
  const { dir } = useI18n();

  const reasons = [
    {
      icon: TrendingUp,
      title: "سوق ضخم ومتنامٍ",
      desc: "صناعة الألعاب الرقمية في المنطقة العربية تنمو بمعدلات قياسية. كنت أو ستكون جزءاً من هذه القصة.",
      color: GOLD,
    },
    {
      icon: Users,
      title: "قاعدة مستخدمين نشطة",
      desc: "آلاف اللاعبين يستخدمون المنصة يومياً، ومعدلات النمو في توسّع مستمر شهراً بعد شهر.",
      color: BLUE,
    },
    {
      icon: ShieldCheck,
      title: "حوكمة وشفافية",
      desc: "هيكل شركة مرخّص ومنظّم. قرارات استراتيجية شفافة وتقارير دورية لكل المساهمين.",
      color: "#10b981",
    },
    {
      icon: Gem,
      title: "أصول رقمية حقيقية",
      desc: "المنصة، التقنية، العلامة التجارية، والعملة الرقمية — كلها أصول قابلة للقياس وذات قيمة متنامية.",
      color: "#a855f7",
    },
  ];

  const advantages = [
    {
      icon: Trophy,
      title: "ريادة في الفئة",
      desc: "نحن من بين الأوائل والأقوى في فئة منصات الألعاب التنافسية الموجّهة للسوق العربي.",
    },
    {
      icon: Globe2,
      title: "توسّع إقليمي مستهدف",
      desc: "خطط واضحة للوصول لكل دول الخليج وشمال إفريقيا خلال السنوات القادمة.",
    },
    {
      icon: Zap,
      title: "تقنية متفوّقة",
      desc: "بنية تحتية حديثة، قابلة للتوسع بسهولة، وتدعم ملايين المستخدمين بنفس الجودة.",
    },
  ];

  const milestones = [
    { q: "Q1", title: "إطلاق منتجات جديدة", done: true },
    { q: "Q2", title: "توسّع إقليمي للخليج", done: true },
    { q: "Q3", title: "إدراج عملة المشروع", done: false },
    { q: "Q4", title: "شراكات استراتيجية كبرى", done: false },
  ];

  return (
    <div
      dir={dir}
      className="min-h-[100svh] bg-[#06080f] text-white relative overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[#ffb627] opacity-15 blur-[140px]" />
        <div className="absolute bottom-0 -right-40 w-[600px] h-[600px] rounded-full bg-[#1e88ff] opacity-20 blur-[140px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-14">
        {/* HERO */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-5"
        >
          <Badge className="bg-emerald-500/15 border-emerald-500/30 text-emerald-400 px-3 py-1 text-xs">
            <Building2 className="w-3 h-3 me-1.5 inline" />
            فرصة استثمارية حصرية
          </Badge>
          <h1
            className="font-['Bebas_Neue'] text-6xl sm:text-7xl md:text-8xl tracking-wider leading-none"
            style={{
              backgroundImage: `linear-gradient(135deg, ${GOLD}, #fff, ${BLUE})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            كن مساهماً في VEX
          </h1>
          <p className="text-base sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            امتلك حصة من شركة تبني مستقبل الترفيه التنافسي في المنطقة. فرصة
            لمن يرى الصورة الكبيرة ويريد أن يكون جزءاً منها قبل غيره.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button
              size="lg"
              className="bg-gradient-to-r from-[#ffb627] to-[#ffa000] text-black hover:opacity-95 font-bold text-base px-8 h-12 rounded-xl shadow-[0_8px_30px_rgba(255,182,39,0.4)]"
            >
              <Sparkles className="w-4 h-4 me-2" />
              احجز مكانك في الجولة
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 font-bold text-base px-8 h-12 rounded-xl bg-transparent"
            >
              <Mail className="w-4 h-4 me-2" />
              تواصل مع فريق العلاقات
            </Button>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs text-slate-500 pt-2">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              عرض حصري
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <Eye className="w-3 h-3" />
              للمستثمرين المؤهلين
            </span>
          </div>
        </motion.div>

        {/* WHY INVEST */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
              لماذا <span style={{ color: GOLD }}>VEX؟</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">
              أربعة أسباب تجعل الاستثمار في VEX قراراً ذكياً
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {reasons.map((r, i) => {
              const Icon = r.icon;
              return (
                <motion.div
                  key={r.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="group h-full bg-gradient-to-br from-[#10172a] to-[#0a0e1a] border-white/10 p-6 rounded-2xl hover:-translate-y-1 transition-all relative overflow-hidden">
                    <div
                      className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20 blur-3xl group-hover:opacity-40 transition-opacity"
                      style={{ background: r.color }}
                    />
                    <div className="relative flex items-start gap-4">
                      <div
                        className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: `${r.color}22`, color: r.color }}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-bold text-lg text-white">
                          {r.title}
                        </h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                          {r.desc}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* USE OF FUNDS — Pie chart */}
        <Card className="bg-gradient-to-br from-[#10172a] to-[#0a0e1a] border-white/10 p-5 sm:p-8 rounded-2xl">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1e88ff]/15 text-[#1e88ff] flex items-center justify-center">
                  <PieIcon className="w-5 h-5" />
                </div>
                <h2 className="font-['Bebas_Neue'] text-3xl sm:text-4xl tracking-wider">
                  تخصيص مقترح لرأس المال
                </h2>
              </div>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                نؤمن بالشفافية الكاملة. هذه نسب التوزيع المقترحة كخطة عامة،
                وقابلة للتعديل وفق ظروف السوق وتوصيات مجلس الإدارة.
              </p>
              <div className="space-y-2.5 pt-2">
                {ALLOC_DATA.map((a) => (
                  <div
                    key={a.name}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: a.color }}
                      />
                      <span className="text-sm text-slate-200">{a.name}</span>
                    </div>
                    <span
                      className="font-['Bebas_Neue'] text-xl tracking-wider"
                      style={{ color: a.color }}
                    >
                      {a.value}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-[280px] sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ALLOC_DATA}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {ALLOC_DATA.map((a) => (
                      <Cell key={a.name} fill={a.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#0a0e1a",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 12,
                      color: "#fff",
                    }}
                    formatter={(v: number) => [`${v}%`, "النسبة"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* COMPETITIVE ADVANTAGES */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
              ميزتنا التنافسية
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {advantages.map((a, i) => {
              const Icon = a.icon;
              return (
                <motion.div
                  key={a.title}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Card className="text-center h-full bg-gradient-to-b from-[#10172a] to-[#0a0e1a] border-white/10 p-6 rounded-2xl hover:border-[#ffb627]/40 transition-all">
                    <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1e88ff]/20 to-[#ffb627]/20 mx-auto mb-4">
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="font-bold text-base text-white mb-2">
                      {a.title}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {a.desc}
                    </p>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* MILESTONES */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
              محطات قادمة
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {milestones.map((m, i) => (
              <motion.div
                key={m.q}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
              >
                <Card
                  className={`h-full p-4 rounded-2xl border ${
                    m.done
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-gradient-to-b from-[#10172a] to-[#0a0e1a] border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="font-['Bebas_Neue'] text-2xl tracking-wider"
                      style={{ color: m.done ? "#34d399" : GOLD }}
                    >
                      {m.q}
                    </span>
                    {m.done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Calendar className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                  <div className="text-sm font-medium text-white">
                    {m.title}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* TRUST */}
        <Card className="bg-gradient-to-br from-[#10172a] to-[#0a0e1a] border-white/10 p-6 sm:p-8 rounded-2xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-['Bebas_Neue'] text-3xl tracking-wider">
              التزامنا تجاه المساهمين
            </h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              "تقارير ربعية شاملة عن الأداء والإيرادات",
              "اجتماعات سنوية للمساهمين بشفافية كاملة",
              "حقوق تصويت متناسبة مع الحصة",
              "خروج مرن عند الحاجة عبر آليات معتمدة",
              "أولوية في الفرص الاستثمارية المستقبلية",
              "تواصل مباشر مع فريق الإدارة العليا",
            ].map((p) => (
              <div key={p} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                <span className="text-sm text-slate-200">{p}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-[#0a0e1a] via-[#10172a] to-[#0a0e1a] border-2 border-[#ffb627]/40 p-8 sm:p-12 rounded-3xl text-center">
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-0 left-0 w-72 h-72 rounded-full bg-[#ffb627] blur-[100px]" />
              <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full bg-[#1e88ff] blur-[100px]" />
            </div>
            <div className="relative space-y-4">
              <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffb627] to-[#ffa000] text-black">
                <Briefcase className="w-7 h-7" />
              </div>
              <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider text-white">
                المقاعد محدودة
              </h2>
              <p className="text-slate-300 max-w-xl mx-auto text-sm sm:text-base">
                نحن نختار مساهمينا بعناية. لو كنت مهتماً جدياً بأن تكون
                جزءاً من رحلتنا، تواصل معنا اليوم وسيعود فريق العلاقات
                الاستثمارية إليك خلال ساعات.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-3">
                <Button
                  size="lg"
                  className="bg-[#ffb627] text-black hover:bg-[#ffb627]/90 font-bold text-base px-8 h-12 rounded-xl shadow-xl"
                >
                  <Mail className="w-4 h-4 me-2" />
                  احجز اجتماعاً
                  <ArrowLeft className="w-4 h-4 ms-2" />
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/40 text-white hover:bg-white/10 font-bold text-base px-8 h-12 rounded-xl bg-transparent"
                >
                  <Link href="/coin">
                    <Coins className="w-4 h-4 me-2" />
                    اطلع على عملة المشروع
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>

        <div className="text-center text-[11px] text-slate-500 pt-2 max-w-2xl mx-auto">
          هذا العرض موجّه للمستثمرين المؤهلين فقط ولا يُعتبر استشارة مالية.
          جميع الاستثمارات تنطوي على مخاطر، يُرجى مراجعة جميع المستندات قبل
          اتخاذ القرار.
        </div>
      </div>
    </div>
  );
}
