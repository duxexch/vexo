import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

type LegalDocumentLayoutProps = {
    icon: LucideIcon;
    titleAr: string;
    titleEn: string;
    updatedAtAr: string;
    updatedAtEn: string;
    children: ReactNode;
};

export function LegalDocumentLayout({
    icon: Icon,
    titleAr,
    titleEn,
    updatedAtAr,
    updatedAtEn,
    children,
}: LegalDocumentLayoutProps) {
    const [, setLocation] = useLocation();
    const { language, dir } = useI18n();
    const isAr = language === "ar";

    return (
        <div className="min-h-[100svh] bg-background bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.1),transparent_45%)] px-4 py-6 sm:py-8 pb-[max(1rem,env(safe-area-inset-bottom))]" dir={dir}>
            <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] end-4 z-10">
                <ThemeToggle />
            </div>
            <div className="max-w-3xl mx-auto">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocation("/login")}
                    className="mb-4 min-h-[44px]"
                >
                    {isAr ? <ArrowRight className="me-2 h-4 w-4" /> : <ArrowLeft className="me-2 h-4 w-4" />}
                    {isAr ? "العودة لتسجيل الدخول" : "Back to Login"}
                </Button>

                <Card className="border-primary/20">
                    <CardContent className="p-4 sm:p-6 md:p-10">
                        <div className="flex items-center gap-3 mb-6">
                            <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
                            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
                                {isAr ? titleAr : titleEn}
                            </h1>
                        </div>
                        <p className="text-sm text-muted-foreground mb-6">
                            {isAr ? updatedAtAr : updatedAtEn}
                        </p>
                        {children}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
