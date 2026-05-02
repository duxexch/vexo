export type AdminRouteEntry = {
    key: string;
    path: string;
    labelEn: string;
    labelAr: string;
    category: "management" | "settings" | "quick-links";
};

export const ADMIN_ROUTE_REGISTRY: AdminRouteEntry[] = [
    { key: "dashboard", path: "/admin/dashboard", labelEn: "Dashboard", labelAr: "لوحة التحكم", category: "management" },
    { key: "users", path: "/admin/users", labelEn: "Users", labelAr: "المستخدمون", category: "management" },
    { key: "transactions", path: "/admin/transactions", labelEn: "Transactions", labelAr: "المعاملات", category: "management" },
    { key: "games", path: "/admin/games", labelEn: "Games", labelAr: "الألعاب", category: "management" },
    { key: "game-sections", path: "/admin/game-sections", labelEn: "Game sections", labelAr: "أقسام الألعاب", category: "management" },
    { key: "challenges", path: "/admin/challenges", labelEn: "Challenges", labelAr: "التحديات", category: "management" },
    { key: "challenge-settings", path: "/admin/challenge-settings", labelEn: "Challenge settings", labelAr: "إعدادات التحديات", category: "management" },
    { key: "p2p", path: "/admin/p2p", labelEn: "P2P", labelAr: "P2P", category: "management" },
    { key: "support-settings", path: "/admin/support-settings", labelEn: "Support settings", labelAr: "إعدادات الدعم", category: "management" },
    { key: "id-verification", path: "/admin/id-verification", labelEn: "ID verification", labelAr: "التحقق من الهوية", category: "management" },
    { key: "realtime", path: "/admin/realtime", labelEn: "Realtime", labelAr: "الوقت الحقيقي", category: "settings" },
    { key: "support", path: "/admin/support", labelEn: "Support contacts", labelAr: "جهات الدعم", category: "management" },
    { key: "anti-cheat", path: "/admin/anti-cheat", labelEn: "Anti-cheat", labelAr: "مكافحة الغش", category: "management" },
    { key: "payment-security", path: "/admin/payment-security", labelEn: "Payment security", labelAr: "أمان المدفوعات", category: "management" },
    { key: "chat-management", path: "/admin/chat-management", labelEn: "Chat management", labelAr: "إدارة المحادثات", category: "management" },
    { key: "sam9", path: "/admin/sam9", labelEn: "SAM9", labelAr: "SAM9", category: "management" },
    { key: "analytics", path: "/admin/analytics", labelEn: "Analytics", labelAr: "التحليلات", category: "management" },
    { key: "disputes", path: "/admin/disputes", labelEn: "Disputes", labelAr: "النزاعات", category: "management" },
    { key: "free-play", path: "/admin/free-play", labelEn: "Free play", labelAr: "اللعب المجاني", category: "management" },
    { key: "marketers", path: "/admin/marketers", labelEn: "Marketers", labelAr: "المسوّقون", category: "management" },
    { key: "gifts", path: "/admin/gifts", labelEn: "Gifts", labelAr: "الهدايا", category: "management" },
    { key: "investments", path: "/admin/investments", labelEn: "Investments", labelAr: "الاستثمارات", category: "management" },
    { key: "finance", path: "/admin/finance", labelEn: "Finance", labelAr: "المالية", category: "management" },
    { key: "agents", path: "/admin/agents", labelEn: "Agents", labelAr: "الوكلاء", category: "management" },
    { key: "tournaments", path: "/admin/tournaments", labelEn: "Tournaments", labelAr: "البطولات", category: "management" },
    { key: "audit-logs", path: "/admin/audit-logs", labelEn: "Audit logs", labelAr: "سجل التدقيق", category: "management" },
    { key: "app-settings", path: "/admin/app-settings", labelEn: "App settings", labelAr: "إعدادات التطبيق", category: "settings" },
    { key: "currency", path: "/admin/currency", labelEn: "Project currency", labelAr: "عملة المشروع", category: "settings" },
    { key: "seo", path: "/admin/seo", labelEn: "SEO", labelAr: "تحسين الظهور", category: "settings" },
    { key: "sections", path: "/admin/sections", labelEn: "Section controls", labelAr: "التحكم بالأقسام", category: "settings" },
    { key: "social-platforms", path: "/admin/social-platforms", labelEn: "Social platforms", labelAr: "المنصات الاجتماعية", category: "settings" },
    { key: "languages", path: "/admin/languages", labelEn: "Languages", labelAr: "اللغات", category: "settings" },
    { key: "badges", path: "/admin/badges", labelEn: "Badges", labelAr: "الشارات", category: "settings" },
    { key: "notifications", path: "/admin/notifications", labelEn: "Notifications", labelAr: "الإشعارات", category: "settings" },
    { key: "payment-methods", path: "/admin/payment-methods", labelEn: "Payment methods", labelAr: "طرق الدفع", category: "settings" },
    { key: "integrations", path: "/admin/integrations", labelEn: "Integrations", labelAr: "التكاملات", category: "settings" },
    { key: "announcements", path: "/admin/announcements", labelEn: "Announcements", labelAr: "الإعلانات", category: "quick-links" },
];

export const ADMIN_ROUTE_PATHS = ADMIN_ROUTE_REGISTRY.map((route) => route.path);

export const ADMIN_ROUTE_PATH_SET = new Set(ADMIN_ROUTE_PATHS);
