import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import {
  Headset,
  MessageCircle,
  Phone,
  Mail,
  ExternalLink,
  Send,
  BookOpen,
  ShieldCheck,
  Wallet,
  Swords
} from "lucide-react";
import {
  SiWhatsapp,
  SiTelegram,
  SiFacebook,
  SiInstagram,
  SiDiscord
} from "react-icons/si";
import { FaTwitter } from "react-icons/fa";

interface SupportContact {
  id: string;
  type: string;
  label: string;
  value: string;
  icon: string | null;
  isActive: boolean;
  displayOrder: number;
}

interface SupportGuideLink {
  id: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  titleKey: string;
  descKey: string;
  utmContent: string;
}

function appendGuideUtm(url: string, content: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "support_page");
  u.searchParams.set("utm_medium", "guide_card");
  u.searchParams.set("utm_campaign", "help_center_aso_eso");
  u.searchParams.set("utm_content", content);
  return u.toString();
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  whatsapp: SiWhatsapp,
  telegram: SiTelegram,
  email: Mail,
  phone: Phone,
  facebook: SiFacebook,
  instagram: SiInstagram,
  twitter: FaTwitter,
  discord: SiDiscord,
  other: MessageCircle,
};

const colorMap: Record<string, string> = {
  whatsapp: "bg-green-600 hover:bg-green-700",
  telegram: "bg-blue-500 hover:bg-blue-600",
  email: "bg-red-500 hover:bg-red-600",
  phone: "bg-emerald-600 hover:bg-emerald-700",
  facebook: "bg-blue-600 hover:bg-blue-700",
  instagram: "bg-pink-600 hover:bg-pink-700",
  twitter: "bg-sky-500 hover:bg-sky-600",
  discord: "bg-indigo-600 hover:bg-indigo-700",
  other: "bg-gray-600 hover:bg-gray-700",
};

function getContactLink(type: string, value: string): string {
  switch (type) {
    case "whatsapp":
      return `https://wa.me/${value.replace(/[^0-9]/g, "")}`;
    case "telegram":
      return value.startsWith("http") ? value : `https://t.me/${value.replace("@", "")}`;
    case "email":
      return `mailto:${value}`;
    case "phone":
      return `tel:${value}`;
    case "facebook":
      return value.startsWith("http") ? value : `https://facebook.com/${value}`;
    case "instagram":
      return value.startsWith("http") ? value : `https://instagram.com/${value.replace("@", "")}`;
    case "twitter":
      return value.startsWith("http") ? value : `https://twitter.com/${value.replace("@", "")}`;
    case "discord":
      return value.startsWith("http") ? value : `https://discord.gg/${value}`;
    default:
      return value.startsWith("http") ? value : `https://${value}`;
  }
}

export default function SupportPage() {
  const { t, dir } = useI18n();

  const guideLinks: SupportGuideLink[] = [
    {
      id: "platform",
      href: "https://vixo.click/guides/vex-platform-overview.html",
      icon: BookOpen,
      titleKey: "support.guidePlatformTitle",
      descKey: "support.guidePlatformDesc",
      utmContent: "platform_overview",
    },
    {
      id: "p2p",
      href: "https://vixo.click/guides/vex-p2p-trading-security.html",
      icon: ShieldCheck,
      titleKey: "support.guideP2PTitle",
      descKey: "support.guideP2PDesc",
      utmContent: "p2p_security",
    },
    {
      id: "games",
      href: "https://vixo.click/guides/vex-games-challenges-guide.html",
      icon: Swords,
      titleKey: "support.guideGamesTitle",
      descKey: "support.guideGamesDesc",
      utmContent: "games_challenges",
    },
    {
      id: "account",
      href: "https://vixo.click/guides/vex-account-wallet-verification.html",
      icon: Wallet,
      titleKey: "support.guideAccountTitle",
      descKey: "support.guideAccountDesc",
      utmContent: "account_wallet",
    },
  ];

  const { data: contacts, isLoading } = useQuery<SupportContact[]>({
    queryKey: ["/api/support/contacts"],
  });

  const activeContacts = contacts?.filter(c => c.isActive) || [];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" dir={dir}>
      <div className="flex items-center gap-3">
        <Headset className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-support-title">
            {t('support.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('support.subtitle')}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-12 w-12 bg-muted rounded-full mb-4" />
                <div className="h-4 w-24 bg-muted rounded mb-2" />
                <div className="h-3 w-32 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : activeContacts.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <Headset className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('support.noContacts')}</h3>
            <p className="text-muted-foreground">{t('support.noContactsDesc')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeContacts
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map(contact => {
              const Icon = iconMap[contact.type] || MessageCircle;
              const bgColor = colorMap[contact.type] || colorMap.other;
              const link = getContactLink(contact.type, contact.value);

              return (
                <Card
                  key={contact.id}
                  className="group hover-elevate transition-all"
                  data-testid={`card-contact-${contact.id}`}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className={`p-2 sm:p-3 rounded-full ${bgColor} text-white`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg mb-1">
                          {contact.label}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate mb-3">
                          {contact.value}
                        </p>
                        <Button
                          asChild
                          className={`w-full ${bgColor} text-white`}
                          data-testid={`button-contact-${contact.id}`}
                        >
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Send className="h-4 w-4 me-2" />
                            {t('support.contact')}
                            <ExternalLink className="h-3 w-3 ms-2" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {t('support.helpTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {t('support.helpDesc')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{t('support.available247')}</Badge>
            <Badge variant="secondary">{t('support.fastResponse')}</Badge>
            <Badge variant="secondary">{t('support.multiLang')}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t('support.guidesTitle')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t('support.guidesDesc')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {guideLinks.map((guide) => {
            const GuideIcon = guide.icon;
            const guideUrl = appendGuideUtm(guide.href, guide.utmContent);
            return (
              <a
                key={guide.id}
                href={guideUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border/60 bg-card/50 p-4 transition-colors hover:border-primary/40 hover:bg-card"
                data-testid={`support-guide-${guide.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <GuideIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">{t(guide.titleKey)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t(guide.descKey)}</p>
                    <div className="mt-2 inline-flex items-center text-xs font-medium text-primary">
                      {t('support.openGuide')}
                      <ExternalLink className="ms-1 h-3 w-3" />
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
          <p className="text-xs text-muted-foreground">{t('support.guidesFooter')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
