// Marketing pages translation source — single source of truth.
// Used by inject-marketing-i18n.mjs to upsert keys into client/src/locales/*.ts
// Languages with full hand-translated strings: ar, en, fr, es, de, tr, zh, ru, pt, hi, fa, ur, ja, id
// All other 95 languages will fall back to English automatically via the i18n loader.

export const TRANSLATIONS = {
  // ============================================================
  // ENGLISH (master / fallback for 95 other languages)
  // ============================================================
  en: {
    // ─── shared marketing copy ───
    "mkt.cta.primary.coin": "Open My Wallet",
    "mkt.cta.secondary.coin": "Trade P2P",
    "mkt.cta.applyAgent": "Apply Now",
    "mkt.cta.contactAdmin": "Contact Manager",
    "mkt.cta.joinAffiliate": "Join the Program",
    "mkt.cta.learnMore": "Learn More",
    "mkt.cta.getMyLink": "Get My Link",
    "mkt.cta.beAgent": "Or join as a certified agent",
    "mkt.cta.bookMeeting": "Book a Meeting",
    "mkt.cta.viewCoin": "Explore Project Coin",
    "mkt.cta.reserveSeat": "Reserve Your Seat",
    "mkt.live": "LIVE",
    "mkt.exclusive": "EXCLUSIVE",
    "mkt.completed": "Completed",
    "mkt.upcoming": "Upcoming",

    // ─── COIN PAGE ───
    "coin.eyebrow": "Project Coin · Live Feed",
    "coin.title": "VEX COIN",
    "coin.subtitle":
      "The official project coin — the unit of value powering every experience inside VEX, opening doors to tournaments, prizes, and exclusive partnerships.",
    "coin.priceNow": "Price Now",
    "coin.last24h": "last 24 hours",
    "coin.chart.title": "Price Movement — 60 Hours",
    "coin.chart.sub": "Live data from the internal trading system",
    "coin.stat.price": "Current Price",
    "coin.stat.priceSub": "vs. 24h ago",
    "coin.stat.supply": "Total Supply",
    "coin.stat.supplySub": "Locked at issuance",
    "coin.stat.volume": "24h Volume",
    "coin.stat.volumeSub": "Last 24 hours",
    "coin.stat.wallets": "Active Wallets",
    "coin.stat.walletsSub": "Steady growth",
    "coin.why.eyebrow": "Why this coin",
    "coin.why.title.a": "Why",
    "coin.why.title.b": "VEX Coin",
    "coin.why.sub": "A coin built to power a full economy — not just a token",
    "coin.use.1.title": "Internal Unit of Value",
    "coin.use.1.desc":
      "Used in every transaction inside the platform: joining tournaments, buying exclusive features, sending gifts, and instantly transferring to other users without third-party fees.",
    "coin.use.2.title": "Capped & Protected Supply",
    "coin.use.2.desc":
      "Total supply is capped and recorded in a transparent smart contract. No additional units can ever be issued, preserving long-term value.",
    "coin.use.3.title": "Daily & Exclusive Rewards",
    "coin.use.3.desc":
      "Earn coins daily through reward programs, tournaments, challenges, and friend referrals. Every interaction has value.",
    "coin.use.4.title": "Full Transparency & Security",
    "coin.use.4.desc":
      "Every exchange and transfer is auditable. The system is backed by a cold wallet and 24/7 monitoring to keep user balances safe.",
    "coin.road.title": "Roadmap",
    "coin.road.sub": "Where we are, and where we're heading",
    "coin.road.1.phase": "Phase 1",
    "coin.road.1.title": "Launch the Internal Coin",
    "coin.road.1.desc":
      "Launch the coin as the platform's official unit of value, integrated with tournaments and daily rewards.",
    "coin.road.2.phase": "Phase 2",
    "coin.road.2.title": "External Wallet Integration",
    "coin.road.2.desc":
      "Support for deposits and withdrawals through approved partners, plus zero-fee P2P transfers between users.",
    "coin.road.3.phase": "Phase 3",
    "coin.road.3.title": "Listing on Trading Platforms",
    "coin.road.3.desc":
      "List the coin on regional and global exchanges to enable buying and selling against other currencies with high liquidity.",
    "coin.road.4.phase": "Phase 4",
    "coin.road.4.title": "Staking System for Holders",
    "coin.road.4.desc":
      "Launch a staking program that rewards long-term holders with a fixed rate added to their balance automatically.",
    "coin.cta.title": "Buy. Trade. Earn.",
    "coin.cta.sub":
      "Start your journey with VEX Coin today. Whether you're a player, an investor, or a partner — your opportunity is here.",
    "coin.disclaimer":
      "Prices shown are for informational purposes. Actual trading happens via the platform's official system.",

    // ─── AGENTS PROGRAM ───
    "agents.eyebrow": "Official Agents Program",
    "agents.title": "Become a VEX Agent",
    "agents.subtitle":
      "Join the fastest-growing agents network in the region. Build your own income source through a long-term partnership with a trusted, modern platform.",
    "agents.benefits.eyebrow": "Why join",
    "agents.benefits.title.a": "Why choose",
    "agents.benefits.title.b": "our partnership?",
    "agents.benefits.sub":
      "Six advantages that make VEX the first choice for serious agents",
    "agents.benefit.1.title": "Recurring Income",
    "agents.benefit.1.desc":
      "Profit from your network's daily growth. Every player you bring becomes an ongoing income source that grows with their activity.",
    "agents.benefit.2.title": "Status & Authority",
    "agents.benefit.2.desc":
      "Become a certified agent under the VEX brand, with full management permissions over your players and a private dashboard with professional tools.",
    "agents.benefit.3.title": "Instant Payout",
    "agents.benefit.3.desc":
      "Receive your commissions fast and without complications. Trusted payment system supporting multiple methods with the lowest possible processing time.",
    "agents.benefit.4.title": "Dedicated Support",
    "agents.benefit.4.desc":
      "An agents support team that works around the clock to help you at every step, from activation to growing and expanding your network.",
    "agents.benefit.5.title": "Full Balance Protection",
    "agents.benefit.5.desc":
      "Your balances and rights are protected by a multi-layered security system and constant auditing. We handle every transaction with full transparency.",
    "agents.benefit.6.title": "Incentives & Promotions",
    "agents.benefit.6.desc":
      "The bigger your network grows, the bigger your privileges: higher commissions, monthly bonuses, and strategic partnership opportunities.",
    "agents.steps.title": "How do you start?",
    "agents.steps.sub": "Four simple steps to become a certified agent",
    "agents.step.1.title": "Submit Your Application",
    "agents.step.1.desc":
      "Fill out the application form and submit your details. The team reviews each request carefully to ensure partnership quality.",
    "agents.step.2.title": "Account Activation",
    "agents.step.2.desc":
      "After approval, your account is activated as an agent with your permissions, and your private dashboard is set up.",
    "agents.step.3.title": "Build Your Network",
    "agents.step.3.desc":
      "Start inviting players via your personal links. Track each player and their activity in real time.",
    "agents.step.4.title": "Collect Your Commissions",
    "agents.step.4.desc":
      "Commissions are calculated automatically based on your network's activity, and credited to your balance on a fixed, reliable schedule.",
    "agents.tools.title": "Tools we put in your hands",
    "agents.tools.sub": "Everything you need to manage your network efficiently",
    "agents.tool.1.title": "Pro Dashboard",
    "agents.tool.1.desc":
      "Live statistics, detailed reports, and full management of your players from one place.",
    "agents.tool.2.title": "Ready Marketing Tools",
    "agents.tool.2.desc":
      "Invite links, custom codes, banners and promotional content you can use immediately.",
    "agents.tool.3.title": "Wide Reach",
    "agents.tool.3.desc":
      "Target players from all Arab countries, and soon from across the world.",
    "agents.promise.title": "Our promise to agents",
    "agents.promise.1": "Full transparency in every calculation",
    "agents.promise.2": "Long-term partnership, not short-lived deals",
    "agents.promise.3": "Continuous tool development based on your needs",
    "agents.promise.4": "Priority on new features and exclusive offers",
    "agents.promise.5": "Direct, flexible communication with management",
    "agents.promise.6": "Real recognition for those who build with us",
    "agents.cta.title": "Opportunity won't wait",
    "agents.cta.sub":
      "Every day of delay means missed earnings. Start your partnership today and join the agents who are building their future with VEX.",
    "agents.cta.note": "We review your application as fast as possible",

    // ─── AFFILIATES ───
    "aff.eyebrow": "Marketers Program",
    "aff.title": "Earn With Every Invite",
    "aff.subtitle":
      "Turn your audience and followers into real income. Join the affiliate program of the strongest gaming platform in the region — start from zero with no signup fees.",
    "aff.stats.support": "24/7",
    "aff.stats.supportLabel": "Support & monitoring",
    "aff.stats.invites": "∞",
    "aff.stats.invitesLabel": "Number of invites",
    "aff.stats.fees": "0",
    "aff.stats.feesLabel": "Joining fees",
    "aff.benefits.title.a": "Features that make you",
    "aff.benefits.title.b": "stand out",
    "aff.benefits.sub": "A program designed for those who take marketing seriously",
    "aff.benefit.1.title": "High Commissions",
    "aff.benefit.1.desc":
      "Earn a share from every active player you bring. The more they engage and stay, the more your income grows automatically.",
    "aff.benefit.2.title": "Live Statistics",
    "aff.benefit.2.desc":
      "Track every click, signup and conversion in real time. Your data is always under your control.",
    "aff.benefit.3.title": "Easy & Fast Withdrawal",
    "aff.benefit.3.desc":
      "Receive your earnings through multiple flexible methods. No painful minimums, no payout delays.",
    "aff.benefit.4.title": "Safe & Fair Tracking",
    "aff.benefit.4.desc":
      "A reliable tracking system guarantees attribution for every referral. No loss, no manipulation — every click counts.",
    "aff.steps.title": "How does the program work?",
    "aff.steps.sub": "From signup to first commission in four steps",
    "aff.step.1.title": "Sign Up as a Marketer",
    "aff.step.1.desc":
      "Create your free account and request to join the marketing program. Approval is fast with no complicated requirements.",
    "aff.step.2.title": "Get Your Links",
    "aff.step.2.desc":
      "We generate unique invite links and custom codes for you. Share them anywhere — your platforms, groups, channels.",
    "aff.step.3.title": "Invite Your Audience",
    "aff.step.3.desc":
      "Anyone who clicks and signs up via your link enters your network automatically, and you start tracking commissions from minute one.",
    "aff.step.4.title": "Collect Your Earnings",
    "aff.step.4.desc":
      "Daily statistics tracking, automatic commission accumulation, and easy withdrawal anytime you want.",
    "aff.audience.title": "This program is great for",
    "aff.audience.1.title": "Content Creators",
    "aff.audience.1.desc":
      "YouTuber, TikToker, Instagrammer — turn your audience into a permanent income source.",
    "aff.audience.2.title": "Performance Marketers",
    "aff.audience.2.desc":
      "Digital marketing expert? Our products are marketable across all channels with professional tools.",
    "aff.audience.3.title": "Community Owners",
    "aff.audience.3.desc":
      "Telegram, WhatsApp, Discord group admin? Every member can become a commission.",
    "aff.diff.title": "What sets us apart?",
    "aff.diff.1": "Precise tracking for every click, signup and conversion",
    "aff.diff.2": "A simple, powerful dashboard always at your fingertips",
    "aff.diff.3": "Ready promo content (banners, copy, videos)",
    "aff.diff.4": "Dedicated technical support for program marketers",
    "aff.diff.5": "Full flexibility in choosing your target audience",
    "aff.diff.6": "Long-term relationship, not short experiments",
    "aff.cta.title": "Start earning today",
    "aff.cta.sub": "No waiting, no fees, no commitments. Just your link and your audience.",

    // ─── INVEST ───
    "invest.eyebrow": "Exclusive Investment Opportunity",
    "invest.title": "Become a VEX Shareholder",
    "invest.subtitle":
      "Own a stake in a company building the future of competitive entertainment in the region. An opportunity for those who see the bigger picture and want to be part of it before others.",
    "invest.exclusiveOffer": "Exclusive Offer",
    "invest.qualifiedOnly": "For qualified investors",
    "invest.why.title.a": "Why",
    "invest.why.title.b": "VEX?",
    "invest.why.sub":
      "Four reasons that make investing in VEX a smart decision",
    "invest.reason.1.title": "Massive, Growing Market",
    "invest.reason.1.desc":
      "Digital gaming in the Arab region is growing at record rates. You either are, or will be, part of this story.",
    "invest.reason.2.title": "Active User Base",
    "invest.reason.2.desc":
      "Thousands of players use the platform daily, with growth rates expanding month after month.",
    "invest.reason.3.title": "Governance & Transparency",
    "invest.reason.3.desc":
      "A licensed and regulated company structure. Transparent strategic decisions and periodic reports for all shareholders.",
    "invest.reason.4.title": "Real Digital Assets",
    "invest.reason.4.desc":
      "The platform, the technology, the brand, and the digital coin — all measurable assets with growing value.",
    "invest.alloc.title": "Proposed capital allocation",
    "invest.alloc.sub":
      "We believe in full transparency. These are our proposed allocation ratios as a general plan, adjustable per market conditions and board recommendations.",
    "invest.alloc.dev": "Platform Development",
    "invest.alloc.marketing": "Marketing & Growth",
    "invest.alloc.expansion": "Regional Expansion",
    "invest.alloc.reserve": "Operating Reserve",
    "invest.alloc.research": "Research & Innovation",
    "invest.adv.title": "Our Competitive Edge",
    "invest.adv.1.title": "Category Leadership",
    "invest.adv.1.desc":
      "We're among the first and strongest in the competitive gaming category for the Arab market.",
    "invest.adv.2.title": "Targeted Regional Expansion",
    "invest.adv.2.desc":
      "Clear plans to reach all Gulf countries and North Africa in the coming years.",
    "invest.adv.3.title": "Superior Technology",
    "invest.adv.3.desc":
      "Modern infrastructure, easily scalable, supporting millions of users at the same quality.",
    "invest.milestones.title": "Upcoming Milestones",
    "invest.ms.1.title": "Launch new products",
    "invest.ms.2.title": "Expand into the Gulf",
    "invest.ms.3.title": "List the project coin",
    "invest.ms.4.title": "Major strategic partnerships",
    "invest.commit.title": "Our commitment to shareholders",
    "invest.commit.1": "Comprehensive quarterly performance and revenue reports",
    "invest.commit.2": "Transparent annual shareholder meetings",
    "invest.commit.3": "Voting rights proportional to your share",
    "invest.commit.4": "Flexible exit options through approved mechanisms",
    "invest.commit.5": "Priority on future investment opportunities",
    "invest.commit.6": "Direct communication with the executive team",
    "invest.cta.title": "Seats are limited",
    "invest.cta.sub":
      "We choose our shareholders carefully. If you're seriously interested in being part of our journey, contact us today and our investor relations team will get back to you within hours.",
    "invest.disclaimer":
      "This offer is intended for qualified investors only and does not constitute financial advice. All investments carry risk; please review all documents before making a decision.",
    "invest.scorecard.rating": "Top tier",
    "invest.scorecard.region": "GCC + NA",
    "invest.scorecard.tech": "Cloud-native",
    "mkt.brand.eyebrow": "VEX Promise",
  },

  // ============================================================
  // ARABIC
  // ============================================================
  ar: {
    "mkt.cta.primary.coin": "افتح محفظتي",
    "mkt.cta.secondary.coin": "تداول P2P",
    "mkt.cta.applyAgent": "قدّم طلبك الآن",
    "mkt.cta.contactAdmin": "تواصل مع المسؤول",
    "mkt.cta.joinAffiliate": "انضم للبرنامج",
    "mkt.cta.learnMore": "تعرف أكثر",
    "mkt.cta.getMyLink": "احصل على رابطي الآن",
    "mkt.cta.beAgent": "أو انضم كوكيل معتمد",
    "mkt.cta.bookMeeting": "احجز اجتماعاً",
    "mkt.cta.viewCoin": "اطلع على عملة المشروع",
    "mkt.cta.reserveSeat": "احجز مكانك في الجولة",
    "mkt.live": "مباشر",
    "mkt.exclusive": "حصري",
    "mkt.completed": "مكتملة",
    "mkt.upcoming": "قريباً",

    "coin.eyebrow": "عملة المشروع · بثٌّ مباشر",
    "coin.title": "VEX COIN",
    "coin.subtitle":
      "عملة المشروع الرسمية — وحدة القيمة التي تشغّل كل تجربة داخل VEX وتفتح لك أبواب البطولات، الجوائز، والشراكات الحصرية.",
    "coin.priceNow": "السعر الآن",
    "coin.last24h": "آخر ٢٤ ساعة",
    "coin.chart.title": "حركة السعر — ٦٠ ساعة",
    "coin.chart.sub": "بيانات مباشرة من نظام التداول الداخلي",
    "coin.stat.price": "السعر الحالي",
    "coin.stat.priceSub": "مقارنة بأمس",
    "coin.stat.supply": "العرض الكلي",
    "coin.stat.supplySub": "مقفول من الإصدار",
    "coin.stat.volume": "حجم التداول",
    "coin.stat.volumeSub": "آخر ٢٤ ساعة",
    "coin.stat.wallets": "المحافظ النشطة",
    "coin.stat.walletsSub": "نمو مستمر",
    "coin.why.eyebrow": "لماذا هذه العملة",
    "coin.why.title.a": "لماذا",
    "coin.why.title.b": "VEX Coin",
    "coin.why.sub": "عملة مصممة لتشغيل اقتصاد كامل، ليس مجرد رمز",
    "coin.use.1.title": "وحدة قيمة داخلية",
    "coin.use.1.desc":
      "تستخدم لكل المعاملات داخل المنصة: المشاركة في البطولات، شراء الميزات الحصرية، إرسال الهدايا، وتحويلها لباقي المستخدمين فوراً وبدون عمولات وسطاء.",
    "coin.use.2.title": "إصدار محدود ومحمي",
    "coin.use.2.desc":
      "العرض الإجمالي للعملة محدود ومسجَّل في عقد ذكي شفاف. لا يمكن إصدار وحدات إضافية، ما يحافظ على القيمة على المدى الطويل.",
    "coin.use.3.title": "مكافآت يومية وحصرية",
    "coin.use.3.desc":
      "احصل على عملات هدية يومياً عبر برامج المكافآت، البطولات، التحديات، وإحالة الأصدقاء. كل مشاركة لها قيمة.",
    "coin.use.4.title": "شفافية وأمان كامل",
    "coin.use.4.desc":
      "كل عملية صرف وتحويل قابلة للتدقيق. النظام مدعوم بمحفظة باردة ومراقبة ٢٤/٧ لضمان أمان أرصدة المستخدمين.",
    "coin.road.title": "خارطة الطريق",
    "coin.road.sub": "أين نحن، وإلى أين نتجه",
    "coin.road.1.phase": "المرحلة ١",
    "coin.road.1.title": "إطلاق العملة الداخلية",
    "coin.road.1.desc":
      "إطلاق العملة كوحدة قيمة رسمية داخل المنصة، وربطها بنظام البطولات والمكافآت اليومية.",
    "coin.road.2.phase": "المرحلة ٢",
    "coin.road.2.title": "ربط محافظ خارجية",
    "coin.road.2.desc":
      "دعم سحب وإيداع العملة عبر شركاء معتمدين، وتفعيل تحويلات P2P بين المستخدمين بدون رسوم وسطاء.",
    "coin.road.3.phase": "المرحلة ٣",
    "coin.road.3.title": "إدراج في منصات تداول",
    "coin.road.3.desc":
      "إدراج العملة في منصات تداول إقليمية وعالمية لتمكين شرائها وبيعها مقابل عملات أخرى بسيولة عالية.",
    "coin.road.4.phase": "المرحلة ٤",
    "coin.road.4.title": "نظام Staking للمساهمين",
    "coin.road.4.desc":
      "إطلاق برنامج staking يكافئ من يحتفظون بالعملة بنسبة ثابتة ومضافة إلى أرصدتهم تلقائياً.",
    "coin.cta.title": "اشترِ. تداول. اربح.",
    "coin.cta.sub":
      "ابدأ رحلتك مع عملة VEX اليوم. سواء كنت لاعباً، مستثمراً، أو شريكاً — هنا تجد فرصتك.",
    "coin.disclaimer":
      "الأسعار المعروضة لأغراض إعلامية. التداول الفعلي يتم عبر النظام الرسمي للمنصة.",

    "agents.eyebrow": "برنامج الوكلاء الرسمي",
    "agents.title": "كن وكيل VEX",
    "agents.subtitle":
      "انضم لشبكة الوكلاء الأكثر نمواً في المنطقة. ابنِ مصدر دخلك الخاص من خلال شراكة طويلة الأمد مع منصة موثوقة ومتطورة.",
    "agents.benefits.eyebrow": "لماذا تنضم",
    "agents.benefits.title.a": "لماذا تختار",
    "agents.benefits.title.b": "شراكتنا؟",
    "agents.benefits.sub": "ست مزايا تجعل من VEX الخيار الأول للوكلاء الجادين",
    "agents.benefit.1.title": "دخل متجدد",
    "agents.benefit.1.desc":
      "استفد من نمو شبكتك يومياً. كل لاعب تجلبه يصبح مصدر دخل مستمر يكبر مع كبر نشاطه ومدة بقائه معك.",
    "agents.benefit.2.title": "مكانة وسلطة",
    "agents.benefit.2.desc":
      "كن وكيلاً معتمداً يحمل اسم VEX، وامتلك صلاحيات إدارة لاعبيك مع لوحة تحكم خاصة وأدوات احترافية.",
    "agents.benefit.3.title": "سحب فوري",
    "agents.benefit.3.desc":
      "احصل على عمولاتك بسرعة وبدون تعقيدات. نظام دفع موثوق يدعم وسائل متعددة وبأقل وقت معالجة ممكن.",
    "agents.benefit.4.title": "دعم مخصص",
    "agents.benefit.4.desc":
      "فريق دعم وكلاء يعمل على مدار الساعة لمساعدتك في كل خطوة، من التفعيل إلى نمو شبكتك وتوسعها.",
    "agents.benefit.5.title": "حماية كاملة لرصيدك",
    "agents.benefit.5.desc":
      "أرصدتك وحقوقك محمية بنظام أمان متعدد الطبقات وتدقيق دائم. نتعامل بشفافية كاملة مع كل معاملة.",
    "agents.benefit.6.title": "حوافز وترقيات",
    "agents.benefit.6.desc":
      "كلما نمت شبكتك، كلما فُتحت لك امتيازات أكبر: عمولات أعلى، مكافآت شهرية، وفرص شراكة استراتيجية.",
    "agents.steps.title": "كيف تبدأ؟",
    "agents.steps.sub": "أربع خطوات بسيطة لتصبح وكيل معتمد",
    "agents.step.1.title": "قدّم طلبك",
    "agents.step.1.desc":
      "املأ نموذج التقديم وأرسل بياناتك. الفريق يراجع كل طلب بعناية لضمان جودة الشراكة.",
    "agents.step.2.title": "تفعيل الحساب",
    "agents.step.2.desc":
      "بعد الموافقة، يُفعَّل حسابك كوكيل مع صلاحياتك، ويتم تجهيز لوحة تحكمك الخاصة.",
    "agents.step.3.title": "ابنِ شبكتك",
    "agents.step.3.desc":
      "ابدأ في دعوة اللاعبين عبر روابط خاصة بك. يمكنك متابعة كل لاعب ونشاطه في الوقت الفعلي.",
    "agents.step.4.title": "اقبض عمولاتك",
    "agents.step.4.desc":
      "تُحسب عمولاتك تلقائياً على نشاط شبكتك، وتُحوَّل لرصيدك في مواعيد ثابتة وموثوقة.",
    "agents.tools.title": "أدوات نضعها بين يديك",
    "agents.tools.sub": "كل ما تحتاجه لإدارة شبكتك بكفاءة",
    "agents.tool.1.title": "لوحة تحكم احترافية",
    "agents.tool.1.desc":
      "إحصائيات حية، تقارير مفصلة، وإدارة كاملة للاعبيك من مكان واحد.",
    "agents.tool.2.title": "أدوات تسويقية جاهزة",
    "agents.tool.2.desc":
      "روابط دعوة، رموز خاصة، صور ومحتوى ترويجي يمكنك استخدامه فوراً.",
    "agents.tool.3.title": "وصول واسع",
    "agents.tool.3.desc": "تستهدف لاعبين من جميع الدول العربية، وقريباً من باقي العالم.",
    "agents.promise.title": "وعدنا للوكلاء",
    "agents.promise.1": "شفافية كاملة في كل عملية حسابية",
    "agents.promise.2": "علاقة شراكة طويلة الأمد، لا تعامل مؤقت",
    "agents.promise.3": "استمرار في تطوير الأدوات حسب احتياجاتك",
    "agents.promise.4": "أولوية عند إطلاق ميزات وعروض جديدة",
    "agents.promise.5": "مرونة في التواصل المباشر مع الإدارة",
    "agents.promise.6": "تقدير حقيقي لمن يبني معنا",
    "agents.cta.title": "الفرصة لا تنتظر",
    "agents.cta.sub":
      "كل يوم تأخير يعني مكاسب ضائعة. ابدأ شراكتك اليوم وانضم لقائمة الوكلاء الذين يبنون مستقبلهم مع VEX.",
    "agents.cta.note": "نراجع طلبك بأسرع وقت ممكن",

    "aff.eyebrow": "برنامج المسوّقين",
    "aff.title": "اكسب مع كل دعوة",
    "aff.subtitle":
      "حوّل جمهورك ومتابعينك إلى دخل حقيقي. سجّل في برنامج التسويق بالعمولة لأقوى منصة ألعاب رقمية في المنطقة، وابدأ من الصفر بدون رسوم اشتراك.",
    "aff.stats.support": "٢٤/٧",
    "aff.stats.supportLabel": "دعم ومتابعة",
    "aff.stats.invites": "∞",
    "aff.stats.invitesLabel": "عدد الدعوات",
    "aff.stats.fees": "٠",
    "aff.stats.feesLabel": "رسوم انضمام",
    "aff.benefits.title.a": "مميزات تجعلك",
    "aff.benefits.title.b": "تتميّز",
    "aff.benefits.sub": "برنامج مصمم خصيصاً لمن يأخذ التسويق بجدية",
    "aff.benefit.1.title": "عمولات مرتفعة",
    "aff.benefit.1.desc":
      "احصل على نسبة من كل لاعب نشِط تجلبه. كلما زاد نشاطه ومدة بقائه، كلما زاد دخلك تلقائياً.",
    "aff.benefit.2.title": "إحصائيات لحظية",
    "aff.benefit.2.desc":
      "تابع كل نقرة وكل تسجيل وكل تحويل في الوقت الفعلي. بياناتك تحت سيطرتك دائماً.",
    "aff.benefit.3.title": "سحب سهل وسريع",
    "aff.benefit.3.desc":
      "استلم أرباحك بطرق متعددة ومرنة. لا حد أدنى مرهق، ولا تأخير في الصرف.",
    "aff.benefit.4.title": "تتبع آمن وعادل",
    "aff.benefit.4.desc":
      "نظام تتبع موثوق يضمن نسب كل إحالة لك. لا فقدان ولا تلاعب — كل نقرة محسوبة.",
    "aff.steps.title": "كيف يعمل البرنامج؟",
    "aff.steps.sub": "من التسجيل لأول عمولة في أربع خطوات",
    "aff.step.1.title": "سجّل كمسوّق",
    "aff.step.1.desc":
      "أنشئ حسابك مجاناً واطلب الانضمام لبرنامج التسويق. الموافقة سريعة وبدون شروط معقدة.",
    "aff.step.2.title": "احصل على روابطك",
    "aff.step.2.desc":
      "نولّد لك روابط دعوة فريدة ورموز خصم خاصة. شاركها في كل مكان: منصاتك، مجموعاتك، قنواتك.",
    "aff.step.3.title": "ادعُ جمهورك",
    "aff.step.3.desc":
      "كل من ينقر ويسجّل عبر رابطك يصبح ضمن شبكتك تلقائياً، وتبدأ تتبّع عمولاتك من اللحظة الأولى.",
    "aff.step.4.title": "استلم أرباحك",
    "aff.step.4.desc":
      "متابعة يومية لإحصائياتك، عمولات تتراكم تلقائياً، وسحب سهل في أي وقت تشاء.",
    "aff.audience.title": "هذا البرنامج مناسب لـ",
    "aff.audience.1.title": "صنّاع المحتوى",
    "aff.audience.1.desc":
      "يوتيوبر، تيكتوكر، إنستجرامر — حوّل جمهورك إلى مصدر دخل دائم.",
    "aff.audience.2.title": "مسوقي الأداء",
    "aff.audience.2.desc":
      "خبير تسويق رقمي؟ منتجاتنا قابلة للتسويق بكل القنوات وبأدوات احترافية.",
    "aff.audience.3.title": "أصحاب المجتمعات",
    "aff.audience.3.desc":
      "مدير مجموعة تليجرام، واتساب، ديسكورد؟ كل عضو يمكن أن يصبح عمولة.",
    "aff.diff.title": "ما الذي يميّزنا؟",
    "aff.diff.1": "تتبع دقيق لكل نقرة وتسجيل وعملية تحويل",
    "aff.diff.2": "لوحة تحكم بسيطة وقوية تحت تصرفك دائماً",
    "aff.diff.3": "أدوات محتوى ترويجي جاهزة (بانرات، نصوص، فيديوهات)",
    "aff.diff.4": "دعم فني مخصص لمسوقي البرنامج",
    "aff.diff.5": "مرونة كاملة في اختيار جمهورك المستهدف",
    "aff.diff.6": "علاقة طويلة الأمد، لا تجارب قصيرة",
    "aff.cta.title": "ابدأ الكسب اليوم",
    "aff.cta.sub": "لا انتظار، لا رسوم، لا التزامات. فقط رابطك وجمهورك.",

    "invest.eyebrow": "فرصة استثمارية حصرية",
    "invest.title": "كن مساهماً في VEX",
    "invest.subtitle":
      "امتلك حصة من شركة تبني مستقبل الترفيه التنافسي في المنطقة. فرصة لمن يرى الصورة الكبيرة ويريد أن يكون جزءاً منها قبل غيره.",
    "invest.exclusiveOffer": "عرض حصري",
    "invest.qualifiedOnly": "للمستثمرين المؤهلين",
    "invest.why.title.a": "لماذا",
    "invest.why.title.b": "VEX؟",
    "invest.why.sub": "أربعة أسباب تجعل الاستثمار في VEX قراراً ذكياً",
    "invest.reason.1.title": "سوق ضخم ومتنامٍ",
    "invest.reason.1.desc":
      "صناعة الألعاب الرقمية في المنطقة العربية تنمو بمعدلات قياسية. كنت أو ستكون جزءاً من هذه القصة.",
    "invest.reason.2.title": "قاعدة مستخدمين نشطة",
    "invest.reason.2.desc":
      "آلاف اللاعبين يستخدمون المنصة يومياً، ومعدلات النمو في توسّع مستمر شهراً بعد شهر.",
    "invest.reason.3.title": "حوكمة وشفافية",
    "invest.reason.3.desc":
      "هيكل شركة مرخّص ومنظّم. قرارات استراتيجية شفافة وتقارير دورية لكل المساهمين.",
    "invest.reason.4.title": "أصول رقمية حقيقية",
    "invest.reason.4.desc":
      "المنصة، التقنية، العلامة التجارية، والعملة الرقمية — كلها أصول قابلة للقياس وذات قيمة متنامية.",
    "invest.alloc.title": "تخصيص مقترح لرأس المال",
    "invest.alloc.sub":
      "نؤمن بالشفافية الكاملة. هذه نسب التوزيع المقترحة كخطة عامة، وقابلة للتعديل وفق ظروف السوق وتوصيات مجلس الإدارة.",
    "invest.alloc.dev": "تطوير المنصة",
    "invest.alloc.marketing": "التسويق والنمو",
    "invest.alloc.expansion": "التوسع الإقليمي",
    "invest.alloc.reserve": "احتياطي تشغيلي",
    "invest.alloc.research": "بحث وابتكار",
    "invest.adv.title": "ميزتنا التنافسية",
    "invest.adv.1.title": "ريادة في الفئة",
    "invest.adv.1.desc":
      "نحن من بين الأوائل والأقوى في فئة منصات الألعاب التنافسية الموجّهة للسوق العربي.",
    "invest.adv.2.title": "توسّع إقليمي مستهدف",
    "invest.adv.2.desc":
      "خطط واضحة للوصول لكل دول الخليج وشمال إفريقيا خلال السنوات القادمة.",
    "invest.adv.3.title": "تقنية متفوّقة",
    "invest.adv.3.desc":
      "بنية تحتية حديثة، قابلة للتوسع بسهولة، وتدعم ملايين المستخدمين بنفس الجودة.",
    "invest.milestones.title": "محطات قادمة",
    "invest.ms.1.title": "إطلاق منتجات جديدة",
    "invest.ms.2.title": "توسّع إقليمي للخليج",
    "invest.ms.3.title": "إدراج عملة المشروع",
    "invest.ms.4.title": "شراكات استراتيجية كبرى",
    "invest.commit.title": "التزامنا تجاه المساهمين",
    "invest.commit.1": "تقارير ربعية شاملة عن الأداء والإيرادات",
    "invest.commit.2": "اجتماعات سنوية للمساهمين بشفافية كاملة",
    "invest.commit.3": "حقوق تصويت متناسبة مع الحصة",
    "invest.commit.4": "خروج مرن عند الحاجة عبر آليات معتمدة",
    "invest.commit.5": "أولوية في الفرص الاستثمارية المستقبلية",
    "invest.commit.6": "تواصل مباشر مع فريق الإدارة العليا",
    "invest.cta.title": "المقاعد محدودة",
    "invest.cta.sub":
      "نحن نختار مساهمينا بعناية. لو كنت مهتماً جدياً بأن تكون جزءاً من رحلتنا، تواصل معنا اليوم وسيعود فريق العلاقات الاستثمارية إليك خلال ساعات.",
    "invest.disclaimer":
      "هذا العرض موجّه للمستثمرين المؤهلين فقط ولا يُعتبر استشارة مالية. جميع الاستثمارات تنطوي على مخاطر، يُرجى مراجعة جميع المستندات قبل اتخاذ القرار.",
    "invest.scorecard.rating": "تصنيف ممتاز",
    "invest.scorecard.region": "الخليج + شمال إفريقيا",
    "invest.scorecard.tech": "بنية سحابية",
    "mkt.brand.eyebrow": "وعد VEX",
  },
};

// ============================================================
// Additional language translations are merged at injection time.
// See scripts/inject-marketing-i18n.mjs.
// ============================================================
