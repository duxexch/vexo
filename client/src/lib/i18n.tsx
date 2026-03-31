import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { Globe, Search, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { en, loadTranslations, getCachedTranslations, type TranslationMap } from '@/locales';

// Language codes — All 109 supported languages
export type Language =
  | 'en' | 'ar' | 'fr' | 'es' | 'de' | 'tr' | 'zh' | 'hi' | 'pt' | 'ru'
  | 'ja' | 'ko' | 'it' | 'nl' | 'pl' | 'id' | 'ms' | 'th' | 'vi' | 'fa'
  | 'ur' | 'he' | 'bn' | 'sv' | 'no' | 'da' | 'fi' | 'el' | 'cs' | 'ro'
  | 'hu' | 'uk' | 'bg' | 'hr' | 'sk' | 'sl' | 'sr' | 'lt' | 'lv' | 'et'
  | 'af' | 'sq' | 'am' | 'hy' | 'az' | 'eu' | 'be' | 'bs' | 'ca' | 'ceb'
  | 'zh-TW' | 'co' | 'eo' | 'fy' | 'gl' | 'ka' | 'gu' | 'ht' | 'ha' | 'haw'
  | 'hmn' | 'is' | 'ig' | 'ga' | 'jv' | 'kn' | 'kk' | 'km' | 'rw' | 'ku'
  | 'ky' | 'lo' | 'la' | 'lb' | 'mk' | 'mg' | 'ml' | 'mt' | 'mi' | 'mr'
  | 'mn' | 'my' | 'ne' | 'ny' | 'or' | 'ps' | 'pa' | 'sm' | 'gd' | 'st'
  | 'sn' | 'sd' | 'si' | 'so' | 'su' | 'sw' | 'tl' | 'tg' | 'ta' | 'tt'
  | 'te' | 'tk' | 'ug' | 'uz' | 'cy' | 'xh' | 'yi' | 'yo' | 'zu';

// Language metadata
interface LanguageInfo {
  code: Language;
  name: string;
  nativeName: string;
  rtl: boolean;
  flag: string;
}

export const languages: LanguageInfo[] = [
  // Original 40 languages
  { code: 'en', name: 'English', nativeName: 'English', rtl: false, flag: '🇺🇸' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true, flag: '🇸🇦' },
  { code: 'fr', name: 'French', nativeName: 'Français', rtl: false, flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', rtl: false, flag: '🇪🇸' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', rtl: false, flag: '🇩🇪' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', rtl: false, flag: '🇹🇷' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', rtl: false, flag: '🇨🇳' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', rtl: false, flag: '🇮🇳' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', rtl: false, flag: '🇧🇷' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', rtl: false, flag: '🇷🇺' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', rtl: false, flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', rtl: false, flag: '🇰🇷' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', rtl: false, flag: '🇮🇹' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', rtl: false, flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', rtl: false, flag: '🇵🇱' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', rtl: false, flag: '🇮🇩' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', rtl: false, flag: '🇲🇾' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', rtl: false, flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', rtl: false, flag: '🇻🇳' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true, flag: '🇮🇷' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true, flag: '🇵🇰' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true, flag: '🇮🇱' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', rtl: false, flag: '🇧🇩' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', rtl: false, flag: '🇸🇪' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', rtl: false, flag: '🇳🇴' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', rtl: false, flag: '🇩🇰' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', rtl: false, flag: '🇫🇮' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', rtl: false, flag: '🇬🇷' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', rtl: false, flag: '🇨🇿' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', rtl: false, flag: '🇷🇴' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', rtl: false, flag: '🇭🇺' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', rtl: false, flag: '🇺🇦' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', rtl: false, flag: '🇧🇬' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', rtl: false, flag: '🇭🇷' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', rtl: false, flag: '🇸🇰' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', rtl: false, flag: '🇸🇮' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', rtl: false, flag: '🇷🇸' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', rtl: false, flag: '🇱🇹' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', rtl: false, flag: '🇱🇻' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', rtl: false, flag: '🇪🇪' },
  // Extended 69 languages
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', rtl: false, flag: '🇿🇦' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip', rtl: false, flag: '🇦🇱' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', rtl: false, flag: '🇪🇹' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', rtl: false, flag: '🇦🇲' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan', rtl: false, flag: '🇦🇿' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara', rtl: false, flag: '🏴' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская', rtl: false, flag: '🇧🇾' },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski', rtl: false, flag: '🇧🇦' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', rtl: false, flag: '🏴' },
  { code: 'ceb', name: 'Cebuano', nativeName: 'Cebuano', rtl: false, flag: '🇵🇭' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文', rtl: false, flag: '🇹🇼' },
  { code: 'co', name: 'Corsican', nativeName: 'Corsu', rtl: false, flag: '🇫🇷' },
  { code: 'eo', name: 'Esperanto', nativeName: 'Esperanto', rtl: false, flag: '🌍' },
  { code: 'fy', name: 'Frisian', nativeName: 'Frysk', rtl: false, flag: '🇳🇱' },
  { code: 'gl', name: 'Galician', nativeName: 'Galego', rtl: false, flag: '🇪🇸' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', rtl: false, flag: '🇬🇪' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', rtl: false, flag: '🇮🇳' },
  { code: 'ht', name: 'Haitian Creole', nativeName: 'Kreyòl Ayisyen', rtl: false, flag: '🇭🇹' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', rtl: false, flag: '🇳🇬' },
  { code: 'haw', name: 'Hawaiian', nativeName: 'ʻŌlelo Hawaiʻi', rtl: false, flag: '🇺🇸' },
  { code: 'hmn', name: 'Hmong', nativeName: 'Hmoob', rtl: false, flag: '🌏' },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', rtl: false, flag: '🇮🇸' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo', rtl: false, flag: '🇳🇬' },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge', rtl: false, flag: '🇮🇪' },
  { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa', rtl: false, flag: '🇮🇩' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', rtl: false, flag: '🇮🇳' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ', rtl: false, flag: '🇰🇿' },
  { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ', rtl: false, flag: '🇰🇭' },
  { code: 'rw', name: 'Kinyarwanda', nativeName: 'Ikinyarwanda', rtl: false, flag: '🇷🇼' },
  { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî', rtl: false, flag: '🇮🇶' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча', rtl: false, flag: '🇰🇬' },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ', rtl: false, flag: '🇱🇦' },
  { code: 'la', name: 'Latin', nativeName: 'Latina', rtl: false, flag: '🏛️' },
  { code: 'lb', name: 'Luxembourgish', nativeName: 'Lëtzebuergesch', rtl: false, flag: '🇱🇺' },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски', rtl: false, flag: '🇲🇰' },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy', rtl: false, flag: '🇲🇬' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', rtl: false, flag: '🇮🇳' },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti', rtl: false, flag: '🇲🇹' },
  { code: 'mi', name: 'Maori', nativeName: 'Te Reo Māori', rtl: false, flag: '🇳🇿' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', rtl: false, flag: '🇮🇳' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол', rtl: false, flag: '🇲🇳' },
  { code: 'my', name: 'Myanmar', nativeName: 'မြန်မာ', rtl: false, flag: '🇲🇲' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', rtl: false, flag: '🇳🇵' },
  { code: 'ny', name: 'Chichewa', nativeName: 'Chichewa', rtl: false, flag: '🇲🇼' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', rtl: false, flag: '🇮🇳' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو', rtl: true, flag: '🇦🇫' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', rtl: false, flag: '🇮🇳' },
  { code: 'sm', name: 'Samoan', nativeName: 'Gagana Sāmoa', rtl: false, flag: '🇼🇸' },
  { code: 'gd', name: 'Scots Gaelic', nativeName: 'Gàidhlig', rtl: false, flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { code: 'st', name: 'Sesotho', nativeName: 'Sesotho', rtl: false, flag: '🇱🇸' },
  { code: 'sn', name: 'Shona', nativeName: 'chiShona', rtl: false, flag: '🇿🇼' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي', rtl: true, flag: '🇵🇰' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', rtl: false, flag: '🇱🇰' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaaliga', rtl: false, flag: '🇸🇴' },
  { code: 'su', name: 'Sundanese', nativeName: 'Basa Sunda', rtl: false, flag: '🇮🇩' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', rtl: false, flag: '🇹🇿' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog', rtl: false, flag: '🇵🇭' },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ', rtl: false, flag: '🇹🇯' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', rtl: false, flag: '🇮🇳' },
  { code: 'tt', name: 'Tatar', nativeName: 'Татар', rtl: false, flag: '🇷🇺' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', rtl: false, flag: '🇮🇳' },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmen', rtl: false, flag: '🇹🇲' },
  { code: 'ug', name: 'Uyghur', nativeName: 'ئۇيغۇرچە', rtl: true, flag: '🇨🇳' },
  { code: 'uz', name: 'Uzbek', nativeName: "O'zbek", rtl: false, flag: '🇺🇿' },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg', rtl: false, flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
  { code: 'xh', name: 'Xhosa', nativeName: 'isiXhosa', rtl: false, flag: '🇿🇦' },
  { code: 'yi', name: 'Yiddish', nativeName: 'ייִדיש', rtl: true, flag: '🇮🇱' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', rtl: false, flag: '🇳🇬' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', rtl: false, flag: '🇿🇦' },
];

// RTL languages — includes all right-to-left scripts
const rtlLanguages: Language[] = ['ar', 'fa', 'ur', 'he', 'ps', 'sd', 'ug', 'yi'];

export function isRtl(lang: Language): boolean {
  return rtlLanguages.includes(lang);
}

// Missing translation tracking
const missingTranslationsByLang: Map<string, Set<string>> = new Map();
const loggedMissingKeys: Set<string> = new Set();

function trackMissingTranslation(lang: string, key: string): void {
  if (!missingTranslationsByLang.has(lang)) {
    missingTranslationsByLang.set(lang, new Set());
  }
  missingTranslationsByLang.get(lang)!.add(key);
}

export function getMissingTranslations(lang?: string): string[] {
  if (lang) {
    return Array.from(missingTranslationsByLang.get(lang) || []);
  }
  const all: string[] = [];
  missingTranslationsByLang.forEach((keys, language) => {
    keys.forEach(key => all.push(`${language}:${key}`));
  });
  return all;
}

export function clearMissingTranslations(lang?: string): void {
  if (lang) {
    missingTranslationsByLang.delete(lang);
  } else {
    missingTranslationsByLang.clear();
  }
  loggedMissingKeys.clear();
}

export function validateTranslations(): { missing: string[], extra: string[] } {
  const enKeys = Object.keys(en);
  const arTranslations = getCachedTranslations('ar');
  if (!arTranslations) return { missing: enKeys, extra: [] };
  const arKeys = Object.keys(arTranslations);
  const missing = enKeys.filter(key => !arTranslations[key]);
  const extra = arKeys.filter(key => !en[key]);
  return { missing, extra };
}

// Interpolation: replace {{var}} and {var} with values
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, p1, p2) => {
    const key = p1 || p2;
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

// Context
interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
  isLoading: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('vex_language');
    return (saved as Language) || 'en';
  });
  const [translations, setTranslations] = useState<TranslationMap>(
    () => getCachedTranslations(language) || en
  );
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef<string | null>(null);

  // Load translations when language changes
  useEffect(() => {
    const cached = getCachedTranslations(language);
    if (cached) {
      setTranslations(cached);
      return;
    }
    const langToLoad = language;
    loadingRef.current = langToLoad;
    setIsLoading(true);
    loadTranslations(langToLoad).then(loaded => {
      if (loadingRef.current === langToLoad) {
        setTranslations(loaded);
        setIsLoading(false);
        loadingRef.current = null;
      }
    });
  }, [language]);

  // Set document direction and lang attribute
  useEffect(() => {
    const rtl = rtlLanguages.includes(language);
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('vex_language', lang);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const value = translations[key] || en[key] || key;
    if (language !== 'en' && !translations[key] && en[key]) {
      trackMissingTranslation(language, key);
      if (import.meta.env.DEV && !loggedMissingKeys.has(`${language}:${key}`)) {
        loggedMissingKeys.add(`${language}:${key}`);
        console.warn(`[i18n] Missing ${language} translation for key: "${key}"`);
      }
    }
    return interpolate(value, params);
  }, [translations, language]);

  const dir = rtlLanguages.includes(language) ? 'rtl' as const : 'ltr' as const;

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, dir, isLoading }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

// Development helper: Shows missing translations count
export function TranslationDebugger() {
  const { language } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  if (!import.meta.env.DEV) return null;

  const { missing: staticMissing } = validateTranslations();
  const runtimeMissing = getMissingTranslations(language);
  const displayMissing = language === 'ar' ? staticMissing : runtimeMissing;
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
            {displayMissing.slice(0, 20).map(key => (
              <div key={key} className="text-muted-foreground truncate">{key}</div>
            ))}
            {displayMissing.length > 20 && (
              <div className="text-muted-foreground">...and {displayMissing.length - 20} more</div>
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
  const [search, setSearch] = useState('');

  const currentLang = languages.find(l => l.code === language);

  const filteredLanguages = languages.filter(lang =>
    lang.name.toLowerCase().includes(search.toLowerCase()) ||
    lang.nativeName.toLowerCase().includes(search.toLowerCase()) ||
    lang.code.toLowerCase().includes(search.toLowerCase())
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
          <span className="hidden sm:inline">{currentLang?.nativeName || 'English'}</span>
          <span className="sm:hidden">{currentLang?.code.toUpperCase() || 'EN'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('language.search')}
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
                {t('language.noResults')}
              </div>
            ) : (
              filteredLanguages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover-elevate ${
                    language === lang.code ? 'bg-primary/10 text-primary' : ''
                  }`}
                  data-testid={`button-lang-${lang.code}`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <div className="flex-1 text-start">
                    <div className="font-medium">{lang.nativeName}</div>
                    <div className="text-xs text-muted-foreground">{lang.name}</div>
                  </div>
                  {language === lang.code && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
