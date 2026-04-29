import { motion } from "framer-motion";
import {
  Crown,
  TrendingUp,
  Users,
  Headphones,
  Wallet,
  ShieldCheck,
  Sparkles,
  Trophy,
  Zap,
  ArrowLeft,
  Clock,
  Globe2,
  Target,
  CheckCircle2,
  Briefcase,
  HandshakeIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { Link } from "wouter";

const BLUE = "#1e88ff";
const GOLD = "#ffb627";

export default function AgentsProgramPage() {
  const { dir } = useI18n();

  const benefits = [
    {
      icon: TrendingUp,
      title: "دخل متجدد",
      desc: "استفد من نمو شبكتك يومياً. كل لاعب تجلبه يصبح مصدر دخل مستمر يكبر مع كبر نشاطه ومدة بقائه معك.",
      color: GOLD,
    },
    {
      icon: Crown,
      title: "مكانة وسلطة",
      desc: "كن وكيلاً معتمداً يحمل اسم VEX، وامتلك صلاحيات إدارة لاعبيك مع لوحة تحكم خاصة وأدوات احترافية.",
      color: BLUE,
    },
    {
      icon: Wallet,
      title: "سحب فوري",
      desc: "احصل على عمولاتك بسرعة وبدون تعقيدات. نظام دفع موثوق يدعم وسائل متعددة وبأقل وقت معالجة ممكن.",
      color: "#10b981",
    },
    {
      icon: Headphones,
      title: "دعم مخصص",
      desc: "فريق دعم وكلاء يعمل على مدار الساعة لمساعدتك في كل خطوة، من التفعيل إلى نمو شبكتك وتوسعها.",
      color: "#a855f7",
    },
    {
      icon: ShieldCheck,
      title: "حماية كاملة لرصيدك",
      desc: "أرصدتك وحقوقك محمية بنظام أمان متعدد الطبقات وتدقيق دائم. نتعامل بشفافية كاملة مع كل معاملة.",
      color: "#06b6d4",
    },
    {
      icon: Trophy,
      title: "حوافز وترقيات",
      desc: "كلما نمت شبكتك، كلما فُتحت لك امتيازات أكبر: عمولات أعلى، مكافآت شهرية، وفرص شراكة استراتيجية.",
      color: "#ec4899",
    },
  ];

  const steps = [
    {
      num: "١",
      title: "قدّم طلبك",
      desc: "املأ نموذج التقديم وأرسل بياناتك. الفريق يراجع كل طلب بعناية لضمان جودة الشراكة.",
    },
    {
      num: "٢",
      title: "تفعيل الحساب",
      desc: "بعد الموافقة، يُفعَّل حسابك كوكيل مع صلاحياتك، ويتم تجهيز لوحة تحكمك الخاصة.",
    },
    {
      num: "٣",
      title: "ابنِ شبكتك",
      desc: "ابدأ في دعوة اللاعبين عبر روابط خاصة بك. يمكنك متابعة كل لاعب ونشاطه في الوقت الفعلي.",
    },
    {
      num: "٤",
      title: "اقبض عمولاتك",
      desc: "تُحسب عمولاتك تلقائياً على نشاط شبكتك، وتُحوَّل لرصيدك في مواعيد ثابتة وموثوقة.",
    },
  ];

  const tools = [
    {
      icon: Briefcase,
      title: "لوحة تحكم احترافية",
      desc: "إحصائيات حية، تقارير مفصلة، وإدارة كاملة للاعبيك من مكان واحد.",
    },
    {
      icon: Target,
      title: "أدوات تسويقية جاهزة",
      desc: "روابط دعوة، رموز خاصة، صور ومحتوى ترويجي يمكنك استخدامه فوراً.",
    },
    {
      icon: Globe2,
      title: "وصول واسع",
      desc: "تستهدف لاعبين من جميع الدول العربية، وقريباً من باقي العالم.",
    },
  ];

  return (
    <div
      dir={dir}
      className="min-h-[100svh] bg-[#06080f] text-white relative overflow-hidden"
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#ffb627] opacity-15 blur-[140px]" />
        <div className="absolute top-1/2 -right-40 w-[600px] h-[600px] rounded-full bg-[#1e88ff] opacity-20 blur-[140px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-14">
        {/* HERO */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-5"
        >
          <Badge className="bg-[#ffb627]/15 border-[#ffb627]/30 text-[#ffb627] px-3 py-1 text-xs">
            <Crown className="w-3 h-3 me-1.5 inline" />
            برنامج الوكلاء الرسمي
          </Badge>
          <h1
            className="font-['Bebas_Neue'] text-6xl sm:text-7xl md:text-8xl tracking-wider leading-none"
            style={{
              backgroundImage: `linear-gradient(135deg, ${GOLD}, #ffd86b, ${BLUE})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            كن وكيل VEX
          </h1>
          <p className="text-base sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            انضم لشبكة الوكلاء الأكثر نمواً في المنطقة. ابنِ مصدر دخلك الخاص
            من خلال شراكة طويلة الأمد مع منصة موثوقة ومتطورة.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button
              size="lg"
              className="bg-[#ffb627] text-black hover:bg-[#ffb627]/90 font-bold text-base px-8 h-12 rounded-xl shadow-[0_8px_30px_rgba(255,182,39,0.4)]"
            >
              <Sparkles className="w-4 h-4 me-2" />
              قدّم طلبك الآن
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 font-bold text-base px-8 h-12 rounded-xl bg-transparent"
            >
              تواصل مع المسؤول
              <ArrowLeft className="w-4 h-4 ms-2" />
            </Button>
          </div>
        </motion.div>

        {/* BENEFITS */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
              لماذا تختار <span style={{ color: GOLD }}>شراكتنا؟</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">
              ست مزايا تجعل من VEX الخيار الأول للوكلاء الجادين
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {benefits.map((b, i) => {
              const Icon = b.icon;
              return (
                <motion.div
                  key={b.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="group h-full bg-gradient-to-br from-[#10172a] to-[#0a0e1a] border-white/10 p-6 rounded-2xl hover:-translate-y-1 transition-all relative overflow-hidden">
                    <div
                      className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20 blur-3xl group-hover:opacity-40 transition-opacity"
                      style={{ background: b.color }}
                    />
                    <div
                      className="relative w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                      style={{ background: `${b.color}22`, color: b.color }}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-lg text-white mb-2">
                      {b.title}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {b.desc}
                    </p>
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
              كيف تبدأ؟
            </h2>
            <p className="text-slate-400 text-sm sm:text-base">
              أربع خطوات بسيطة لتصبح وكيل معتمد
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <Card className="relative h-full bg-gradient-to-b from-[#10172a] to-[#0a0e1a] border-white/10 p-6 rounded-2xl">
                  <div
                    className="font-['Bebas_Neue'] text-7xl tracking-wider leading-none opacity-30"
                    style={{ color: GOLD }}
                  >
                    {s.num}
                  </div>
                  <div className="absolute top-6 left-6 w-2 h-2 rounded-full bg-[#ffb627] shadow-[0_0_12px_#ffb627]" />
                  <h3 className="font-bold text-lg text-white mt-3 mb-2">
                    {s.title}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {s.desc}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* TOOLS */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
              أدوات نضعها بين يديك
            </h2>
            <p className="text-slate-400 text-sm sm:text-base">
              كل ما تحتاجه لإدارة شبكتك بكفاءة
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {tools.map((t, i) => {
              const Icon = t.icon;
              return (
                <motion.div
                  key={t.title}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Card className="h-full text-center bg-gradient-to-b from-[#10172a] to-[#0a0e1a] border-white/10 p-6 rounded-2xl">
                    <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1e88ff]/20 to-[#ffb627]/20 mx-auto mb-4">
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="font-bold text-base text-white mb-2">
                      {t.title}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {t.desc}
                    </p>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* TRUST POINTS */}
        <Card className="bg-gradient-to-br from-[#10172a] to-[#0a0e1a] border-white/10 p-6 sm:p-8 rounded-2xl">
          <h3 className="font-['Bebas_Neue'] text-3xl tracking-wider text-center mb-6">
            وعدنا للوكلاء
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              "شفافية كاملة في كل عملية حسابية",
              "علاقة شراكة طويلة الأمد، لا تعامل مؤقت",
              "استمرار في تطوير الأدوات حسب احتياجاتك",
              "أولوية عند إطلاق ميزات وعروض جديدة",
              "مرونة في التواصل المباشر مع الإدارة",
              "تقدير حقيقي لمن يبني معنا",
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
          <Card className="relative overflow-hidden bg-gradient-to-br from-[#ffb627] via-[#ffa000] to-[#cc8800] border-0 p-8 sm:p-12 rounded-3xl text-center text-black">
            <div className="absolute inset-0 opacity-25">
              <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-white blur-[100px]" />
            </div>
            <div className="relative space-y-4">
              <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-black/20 text-black">
                <HandshakeIcon className="w-7 h-7" />
              </div>
              <h2 className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-wider">
                الفرصة لا تنتظر
              </h2>
              <p className="text-black/80 max-w-xl mx-auto text-sm sm:text-base font-medium">
                كل يوم تأخير يعني مكاسب ضائعة. ابدأ شراكتك اليوم وانضم لقائمة
                الوكلاء الذين يبنون مستقبلهم مع VEX.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-3">
                <Button
                  size="lg"
                  className="bg-black text-[#ffb627] hover:bg-black/90 font-bold text-base px-8 h-12 rounded-xl"
                >
                  <Zap className="w-4 h-4 me-2" />
                  قدّم طلبك الآن
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-black/40 text-black hover:bg-black/10 font-bold text-base px-8 h-12 rounded-xl bg-transparent"
                >
                  <Link href="/affiliates">أم تفضل برنامج التسويق؟</Link>
                </Button>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-black/60 pt-2">
                <Clock className="w-3 h-3" />
                نراجع طلبك بأسرع وقت ممكن
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
