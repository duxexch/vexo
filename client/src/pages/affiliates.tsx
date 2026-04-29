import { motion } from "framer-motion";
import {
  Megaphone,
  Link2,
  TrendingUp,
  BarChart3,
  Wallet,
  Users,
  Sparkles,
  ArrowLeft,
  Target,
  Share2,
  CheckCircle2,
  PartyPopper,
  Globe2,
  MousePointerClick,
  Lock,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { Link } from "wouter";

const BLUE = "#1e88ff";
const GOLD = "#ffb627";

export default function AffiliatesPage() {
  const { dir } = useI18n();

  const benefits = [
    {
      icon: TrendingUp,
      title: "عمولات مرتفعة",
      desc: "احصل على نسبة من كل لاعب نشِط تجلبه. كلما زاد نشاطه ومدة بقائه، كلما زاد دخلك تلقائياً.",
      color: GOLD,
    },
    {
      icon: BarChart3,
      title: "إحصائيات لحظية",
      desc: "تابع كل نقرة وكل تسجيل وكل تحويل في الوقت الفعلي. بياناتك تحت سيطرتك دائماً.",
      color: BLUE,
    },
    {
      icon: Wallet,
      title: "سحب سهل وسريع",
      desc: "استلم أرباحك بطرق متعددة ومرنة. لا حد أدنى مرهق، ولا تأخير في الصرف.",
      color: "#10b981",
    },
    {
      icon: Lock,
      title: "تتبع آمن وعادل",
      desc: "نظام تتبع موثوق يضمن نسب كل إحالة لك. لا فقدان ولا تلاعب — كل نقرة محسوبة.",
      color: "#a855f7",
    },
  ];

  const steps = [
    {
      num: "١",
      icon: Sparkles,
      title: "سجّل كمسوّق",
      desc: "أنشئ حسابك مجاناً واطلب الانضمام لبرنامج التسويق. الموافقة سريعة وبدون شروط معقدة.",
    },
    {
      num: "٢",
      icon: Link2,
      title: "احصل على روابطك",
      desc: "نولّد لك روابط دعوة فريدة ورموز خصم خاصة. شاركها في كل مكان: منصاتك، مجموعاتك، قنواتك.",
    },
    {
      num: "٣",
      icon: MousePointerClick,
      title: "ادعُ جمهورك",
      desc: "كل من ينقر ويسجّل عبر رابطك يصبح ضمن شبكتك تلقائياً، وتبدأ تتبّع عمولاتك من اللحظة الأولى.",
    },
    {
      num: "٤",
      icon: PartyPopper,
      title: "استلم أرباحك",
      desc: "متابعة يومية لإحصائياتك، عمولات تتراكم تلقائياً، وسحب سهل في أي وقت تشاء.",
    },
  ];

  const audiences = [
    {
      icon: Globe2,
      title: "صنّاع المحتوى",
      desc: "يوتيوبر، تيكتوكر، إنستجرامر — حوّل جمهورك إلى مصدر دخل دائم.",
    },
    {
      icon: Megaphone,
      title: "مسوقي الأداء",
      desc: "خبير تسويق رقمي؟ منتجاتنا قابلة للتسويق بكل القنوات وبأدوات احترافية.",
    },
    {
      icon: Users,
      title: "أصحاب المجتمعات",
      desc: "مدير مجموعة تليجرام، واتساب، ديسكورد؟ كل عضو يمكن أن يصبح عمولة.",
    },
  ];

  return (
    <div
      dir={dir}
      className="min-h-[100svh] bg-[#06080f] text-white relative overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-[#1e88ff] opacity-20 blur-[140px]" />
        <div className="absolute bottom-0 -left-40 w-[500px] h-[500px] rounded-full bg-[#ffb627] opacity-15 blur-[140px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-14">
        {/* HERO */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-5"
        >
          <Badge className="bg-[#1e88ff]/15 border-[#1e88ff]/30 text-[#1e88ff] px-3 py-1 text-xs">
            <Megaphone className="w-3 h-3 me-1.5 inline" />
            برنامج المسوّقين
          </Badge>
          <h1
            className="font-['Bebas_Neue'] text-6xl sm:text-7xl md:text-8xl tracking-wider leading-none"
            style={{
              backgroundImage: `linear-gradient(135deg, ${BLUE}, #6dd5ff, ${GOLD})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            اكسب مع كل دعوة
          </h1>
          <p className="text-base sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            حوّل جمهورك ومتابعينك إلى دخل حقيقي. سجّل في برنامج التسويق
            بالعمولة لأقوى منصة ألعاب رقمية في المنطقة، وابدأ من الصفر بدون
            رسوم اشتراك.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button
              asChild
              size="lg"
              className="bg-[#1e88ff] text-white hover:bg-[#1e88ff]/90 font-bold text-base px-8 h-12 rounded-xl shadow-[0_8px_30px_rgba(30,136,255,0.4)]"
            >
              <Link href="/referral">
                <Sparkles className="w-4 h-4 me-2" />
                انضم للبرنامج
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 font-bold text-base px-8 h-12 rounded-xl bg-transparent"
            >
              تعرف أكثر
              <ArrowLeft className="w-4 h-4 ms-2" />
            </Button>
          </div>
        </motion.div>

        {/* TOP STATS BAR */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Card className="bg-gradient-to-r from-[#10172a] via-[#0f1730] to-[#10172a] border-white/10 p-5 sm:p-6 rounded-2xl">
            <div className="grid grid-cols-3 gap-2 sm:gap-6 text-center">
              <div>
                <div className="font-['Bebas_Neue'] text-3xl sm:text-4xl tracking-wider text-[#ffb627]">
                  ٢٤/٧
                </div>
                <div className="text-xs sm:text-sm text-slate-400 mt-1">
                  دعم ومتابعة
                </div>
              </div>
              <div className="border-x border-white/10">
                <div className="font-['Bebas_Neue'] text-3xl sm:text-4xl tracking-wider text-[#1e88ff]">
                  ∞
                </div>
                <div className="text-xs sm:text-sm text-slate-400 mt-1">
                  عدد الدعوات
                </div>
              </div>
              <div>
                <div className="font-['Bebas_Neue'] text-3xl sm:text-4xl tracking-wider text-emerald-400">
                  ٠
                </div>
                <div className="text-xs sm:text-sm text-slate-400 mt-1">
                  رسوم انضمام
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* BENEFITS */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
              مميزات تجعلك <span style={{ color: BLUE }}>تتميّز</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">
              برنامج مصمم خصيصاً لمن يأخذ التسويق بجدية
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {benefits.map((b, i) => {
              const Icon = b.icon;
              return (
                <motion.div
                  key={b.title}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="group h-full bg-gradient-to-br from-[#10172a] to-[#0a0e1a] border-white/10 p-6 rounded-2xl hover:border-[#1e88ff]/40 transition-all hover:-translate-y-1">
                    <div className="flex items-start gap-4">
                      <div
                        className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: `${b.color}22`, color: b.color }}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-bold text-lg text-white">
                          {b.title}
                        </h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                          {b.desc}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
              كيف يعمل البرنامج؟
            </h2>
            <p className="text-slate-400 text-sm sm:text-base">
              من التسجيل لأول عمولة في أربع خطوات
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.num}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card className="group relative h-full bg-gradient-to-b from-[#10172a] to-[#0a0e1a] border-white/10 p-5 rounded-2xl">
                    <div className="flex items-start justify-between">
                      <div
                        className="font-['Bebas_Neue'] text-6xl tracking-wider leading-none opacity-40"
                        style={{ color: BLUE }}
                      >
                        {s.num}
                      </div>
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1e88ff]/20 to-[#ffb627]/20 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <h3 className="font-bold text-base text-white mt-3 mb-2">
                      {s.title}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {s.desc}
                    </p>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* AUDIENCES */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
              هذا البرنامج مناسب لـ
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {audiences.map((a, i) => {
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

        {/* TRUST CHECKLIST */}
        <Card className="bg-gradient-to-br from-[#10172a] to-[#0a0e1a] border-white/10 p-6 sm:p-8 rounded-2xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <h3 className="font-['Bebas_Neue'] text-3xl tracking-wider">
              ما الذي يميّزنا؟
            </h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              "تتبع دقيق لكل نقرة وتسجيل وعملية تحويل",
              "لوحة تحكم بسيطة وقوية تحت تصرفك دائماً",
              "أدوات محتوى ترويجي جاهزة (بانرات، نصوص، فيديوهات)",
              "دعم فني مخصص لمسوقي البرنامج",
              "مرونة كاملة في اختيار جمهورك المستهدف",
              "علاقة طويلة الأمد، لا تجارب قصيرة",
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
          <Card className="relative overflow-hidden bg-gradient-to-br from-[#1e88ff] via-[#1565c0] to-[#0a3a8c] border-0 p-8 sm:p-12 rounded-3xl text-center">
            <div className="absolute inset-0 opacity-25">
              <div className="absolute top-0 left-0 w-72 h-72 rounded-full bg-[#ffb627] blur-[100px]" />
              <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full bg-white blur-[100px]" />
            </div>
            <div className="relative space-y-4">
              <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-[#ffb627] text-black">
                <Share2 className="w-7 h-7" />
              </div>
              <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider text-white">
                ابدأ الكسب اليوم
              </h2>
              <p className="text-white/85 max-w-xl mx-auto text-sm sm:text-base">
                لا انتظار، لا رسوم، لا التزامات. فقط رابطك وجمهورك.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-[#ffb627] text-black hover:bg-[#ffb627]/90 font-bold text-base px-8 h-12 rounded-xl shadow-xl"
                >
                  <Link href="/referral">
                    <Zap className="w-4 h-4 me-2" />
                    احصل على رابطي الآن
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/40 text-white hover:bg-white/10 font-bold text-base px-8 h-12 rounded-xl bg-transparent"
                >
                  <Link href="/agents-program">أو انضم كوكيل معتمد</Link>
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
