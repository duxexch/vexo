import { useState } from "react";
import { Globe, Search, Check } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    getMissingTranslations,
    languages,
    useI18n,
    validateTranslations,
} from "@/lib/i18n";

// Development helper: Shows missing translations count
export function TranslationDebugger() {
    const { language } = useI18n();
    const [showDetails, setShowDetails] = useState(false);

    if (!import.meta.env.DEV) return null;

    const { missing: staticMissing } = validateTranslations();
    const runtimeMissing = getMissingTranslations(language);
    const displayMissing = language === "ar" ? staticMissing : runtimeMissing;
    const totalCount = displayMissing.length;

    if (totalCount === 0) return null;

    return (
        <div className="fixed bottom-4 end-4 z-50">
            <Button
                size="sm"
                variant="outline"
                className="bg-yellow-500/20 border-yellow-500 text-yellow-600 hover:bg-yellow-500/30"
                onClick={() => setShowDetails(!showDetails)}
            >
                {totalCount} missing ({language})
            </Button>
            {showDetails && (
                <div className="absolute bottom-full end-0 mb-2 w-80 max-h-60 overflow-auto bg-background border rounded-lg shadow-lg p-3 text-xs">
                    <p className="font-medium mb-2">Missing {language.toUpperCase()} translations:</p>
                    <div className="space-y-1">
                        {displayMissing.slice(0, 20).map((key) => (
                            <div key={key} className="text-muted-foreground truncate">
                                {key}
                            </div>
                        ))}
                        {displayMissing.length > 20 && (
                            <div className="text-muted-foreground">
                                ...and {displayMissing.length - 20} more
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export function LanguageSwitcher() {
    const { language, setLanguage, t } = useI18n();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const currentLang = languages.find((l) => l.code === language);

    const filteredLanguages = languages.filter(
        (lang) =>
            lang.name.toLowerCase().includes(search.toLowerCase()) ||
            lang.nativeName.toLowerCase().includes(search.toLowerCase()) ||
            lang.code.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    data-testid="button-language-switch"
                >
                    <Globe className="w-4 h-4" />
                    <span className="hidden sm:inline">{currentLang?.nativeName || "English"}</span>
                    <span className="sm:hidden">{currentLang?.code.toUpperCase() || "EN"}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
                <div className="p-3 border-b">
                    <div className="relative">
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder={t("language.search")}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="ps-9"
                            data-testid="input-language-search"
                        />
                    </div>
                </div>
                <ScrollArea className="h-[300px]">
                    <div className="p-2">
                        {filteredLanguages.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground text-sm">
                                {t("language.noResults")}
                            </div>
                        ) : (
                            filteredLanguages.map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => {
                                        setLanguage(lang.code);
                                        setOpen(false);
                                        setSearch("");
                                    }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover-elevate ${language === lang.code ? "bg-primary/10 text-primary" : ""
                                        }`}
                                    data-testid={`button-lang-${lang.code}`}
                                >
                                    <span className="text-lg">{lang.flag}</span>
                                    <div className="flex-1 text-start">
                                        <div className="font-medium">{lang.nativeName}</div>
                                        <div className="text-xs text-muted-foreground">{lang.name}</div>
                                    </div>
                                    {language === lang.code && <Check className="w-4 h-4 text-primary" />}
                                </button>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
