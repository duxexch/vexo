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
        <div className="min-h-screen bg-background py-8 px-4" dir={dir}>
            <div className="absolute top-4 end-4">
                <ThemeToggle />
            </div>
            <div className="max-w-3xl mx-auto">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocation("/login")}
                    className="mb-4"
                >
                    {isAr ? <ArrowRight className="me-2 h-4 w-4" /> : <ArrowLeft className="me-2 h-4 w-4" />}
                    {isAr ? "العودة لتسجيل الدخول" : "Back to Login"}
                </Button>

                <Card className="border-primary/20">
                    <CardContent className="p-6 md:p-10">
                        <div className="flex items-center gap-3 mb-6">
                            <Icon className="w-8 h-8 text-primary" />
                            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
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
