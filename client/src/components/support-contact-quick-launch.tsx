import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { ExternalLink, Headphones, Loader2, Mail, Phone, X } from "lucide-react";

interface SupportContact {
    id: string;
    type: string;
    value: string;
    label?: string;
    isActive?: boolean;
}

const CONTACT_LABEL_KEYS: Record<string, string> = {
    whatsapp: "support.whatsapp",
    telegram: "support.telegram",
    email: "support.email",
    phone: "support.phone",
    facebook: "support.facebook",
    instagram: "support.instagram",
    twitter: "support.twitter",
    discord: "support.discord",
    other: "support.otherLink",
};

const CONTACT_STYLES: Record<string, { gradient: string; icon: string; shadow: string }> = {
    whatsapp: { gradient: "from-green-500 to-green-600", icon: "📱", shadow: "shadow-green-500/25" },
    telegram: { gradient: "from-sky-400 to-blue-500", icon: "✈️", shadow: "shadow-blue-500/25" },
    email: { gradient: "from-amber-500 to-orange-500", icon: "✉️", shadow: "shadow-orange-500/25" },
    phone: { gradient: "from-emerald-500 to-teal-600", icon: "📞", shadow: "shadow-emerald-500/25" },
    facebook: { gradient: "from-blue-500 to-blue-700", icon: "👤", shadow: "shadow-blue-600/25" },
    instagram: { gradient: "from-pink-500 to-purple-600", icon: "📸", shadow: "shadow-pink-500/25" },
    twitter: { gradient: "from-gray-700 to-gray-900", icon: "𝕏", shadow: "shadow-gray-700/25" },
    discord: { gradient: "from-indigo-500 to-violet-600", icon: "🎮", shadow: "shadow-indigo-500/25" },
    other: { gradient: "from-gray-500 to-gray-600", icon: "🔗", shadow: "shadow-gray-500/25" },
};

function getContactUrl(type: string, value: string): string {
    switch (type) {
        case "whatsapp":
            return value.startsWith("http") ? value : `https://wa.me/${value.replace(/[^0-9]/g, "")}`;
        case "telegram":
            return value.startsWith("http") ? value : `https://t.me/${value.replace("@", "")}`;
        case "email":
            return `mailto:${value}`;
        case "phone":
            return `tel:${value}`;
        case "facebook":
            return value.startsWith("http") ? value : `https://facebook.com/${value}`;
        case "instagram":
            return value.startsWith("http") ? value : `https://instagram.com/${value}`;
        case "twitter":
            return value.startsWith("http") ? value : `https://x.com/${value}`;
        case "discord":
            return value.startsWith("http") ? value : `https://discord.gg/${value}`;
        default:
            return value.startsWith("http") ? value : `https://${value}`;
    }
}

function ContactIcon({ type, className = "h-5 w-5" }: { type: string; className?: string }) {
    if (type === "email") return <Mail className={className} />;
    if (type === "phone") return <Phone className={className} />;
    return <span className="text-lg leading-none">{CONTACT_STYLES[type]?.icon || "🔗"}</span>;
}

export function SupportContactQuickLaunch() {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const { t } = useI18n();

    const { data: contacts, isLoading } = useQuery<SupportContact[]>({
        queryKey: ["public-support-contacts"],
        queryFn: async () => {
            const response = await fetch("/api/support/contacts");
            if (!response.ok) {
                throw new Error("Failed");
            }
            return response.json();
        },
        staleTime: 60_000,
    });

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [isOpen]);

    const activeContacts = contacts?.filter((contact) => contact.isActive) || [];

    return (
        <>
            <Button
                ref={buttonRef}
                variant="outline"
                size="sm"
                onClick={() => setIsOpen((prev) => !prev)}
                className="flex items-center gap-1.5 h-9 px-3"
                aria-label={t("support.title")}
                title={t("support.title")}
            >
                <Headphones className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">{t("support.title")}</span>
            </Button>

            {isOpen && (
                <div className="fixed inset-0 z-[200]" onClick={() => setIsOpen(false)}>
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

                    <div
                        className="absolute inset-4 sm:inset-auto sm:top-14 sm:start-4 flex items-center justify-center sm:block"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="w-full max-w-sm sm:w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="bg-gradient-to-br from-primary to-primary/80 px-5 py-4 text-primary-foreground">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                                            <Headphones className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-sm">{t("support.technicalSupport")}</h3>
                                            <p className="text-[10px] text-primary-foreground/70">{t("support.hereToHelp")}</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsOpen(false)}
                                        className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                                        aria-label={t("common.close")}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                                <p className="text-xs text-primary-foreground/80">{t("support.chooseContact")}</p>
                            </div>

                            <div className="p-3 max-h-[50vh] sm:max-h-[320px] overflow-y-auto bg-card">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                    </div>
                                ) : activeContacts.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Headphones className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                                        <p className="text-sm text-muted-foreground">{t("support.noContacts")}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {activeContacts.map((contact) => {
                                            const style = CONTACT_STYLES[contact.type] || CONTACT_STYLES.other;
                                            return (
                                                <a
                                                    key={contact.id}
                                                    href={getContactUrl(contact.type, contact.value)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${style.gradient} text-white shadow-md ${style.shadow} transition-all duration-200 hover:brightness-110 active:scale-[0.98]`}
                                                >
                                                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 shrink-0">
                                                        <ContactIcon type={contact.type} className="h-5 w-5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-semibold text-sm">
                                                            {contact.label || t(CONTACT_LABEL_KEYS[contact.type] || "support.otherLink")}
                                                        </p>
                                                        <p className="text-[11px] text-white/70 truncate mt-0.5" dir="ltr" style={{ textAlign: "start" }}>
                                                            {contact.value}
                                                        </p>
                                                    </div>
                                                    <ExternalLink className="h-3.5 w-3.5 text-white/40 shrink-0 group-hover:text-white/80 transition-colors" />
                                                </a>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2.5 border-t border-border bg-muted/40 text-center">
                                <p className="text-[10px] text-muted-foreground">{t("support.available247")}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default SupportContactQuickLaunch;