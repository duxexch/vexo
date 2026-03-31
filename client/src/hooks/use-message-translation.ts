import { useState, useCallback, useRef, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

interface TranslationState {
  translatedText: string | null;
  isTranslating: boolean;
  error: string | null;
  showOriginal: boolean;
}

export interface TranslationLanguage {
  code: string;
  name: string;
  nativeName: string;
}

/**
 * All world languages supported by the translation system.
 * This list is used for the language selector dropdown.
 */
export const ALL_LANGUAGES: TranslationLanguage[] = [
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'ceb', name: 'Cebuano', nativeName: 'Cebuano' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'co', name: 'Corsican', nativeName: 'Corsu' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'eo', name: 'Esperanto', nativeName: 'Esperanto' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'fy', name: 'Frisian', nativeName: 'Frysk' },
  { code: 'gl', name: 'Galician', nativeName: 'Galego' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'ht', name: 'Haitian Creole', nativeName: 'Kreyòl Ayisyen' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  { code: 'haw', name: 'Hawaiian', nativeName: 'ʻŌlelo Hawaiʻi' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'hmn', name: 'Hmong', nativeName: 'Hmoob' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ' },
  { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ' },
  { code: 'rw', name: 'Kinyarwanda', nativeName: 'Ikinyarwanda' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча' },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ' },
  { code: 'la', name: 'Latin', nativeName: 'Latina' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'lb', name: 'Luxembourgish', nativeName: 'Lëtzebuergesch' },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски' },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti' },
  { code: 'mi', name: 'Maori', nativeName: 'Te Reo Māori' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол' },
  { code: 'my', name: 'Myanmar', nativeName: 'မြန်မာ' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'ny', name: 'Chichewa', nativeName: 'Chichewa' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'sm', name: 'Samoan', nativeName: 'Gagana Sāmoa' },
  { code: 'gd', name: 'Scots Gaelic', nativeName: 'Gàidhlig' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'st', name: 'Sesotho', nativeName: 'Sesotho' },
  { code: 'sn', name: 'Shona', nativeName: 'chiShona' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaaliga' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'su', name: 'Sundanese', nativeName: 'Basa Sunda' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog' },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'tt', name: 'Tatar', nativeName: 'Татар' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmen' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'ug', name: 'Uyghur', nativeName: 'ئۇيغۇرچە' },
  { code: 'uz', name: 'Uzbek', nativeName: "O'zbek" },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg' },
  { code: 'xh', name: 'Xhosa', nativeName: 'isiXhosa' },
  { code: 'yi', name: 'Yiddish', nativeName: 'ייִדיש' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
];

interface UseMessageTranslation {
  /** Get the display text (translated or original) */
  getDisplayText: (messageId: string, originalText: string) => string;
  /** Get the translated text only (null if not translated) */
  getTranslatedText: (messageId: string) => string | null;
  /** Check if a message has been translated */
  hasTranslation: (messageId: string) => boolean;
  /** Toggle between original and translated text */
  toggleTranslation: (messageId: string, originalText: string) => void;
  /** Check if a message is currently being translated */
  isTranslating: (messageId: string) => boolean;
  /** Check if original is being shown (vs translated) */
  isShowingOriginal: (messageId: string) => boolean;
  /** Whether auto-translate is enabled */
  autoTranslate: boolean;
  /** Toggle auto-translate on/off */
  setAutoTranslate: (enabled: boolean) => void;
  /** Translate a message on demand */
  translateMessage: (messageId: string, text: string) => Promise<string | null>;
  /** The chosen target language code */
  targetLanguage: string;
  /** Set target language for translation */
  setTargetLanguage: (langCode: string) => void;
  /** All available languages */
  languages: TranslationLanguage[];
  /** Get the current target language display info */
  currentLanguageInfo: TranslationLanguage | undefined;
}

/**
 * Hook for chat message translation.
 * Provides per-message translation state, auto-translate toggle,
 * and language selector with all world languages.
 */
export function useMessageTranslation(): UseMessageTranslation {
  const { language: uiLanguage } = useI18n();
  const [states, setStates] = useState<Map<string, TranslationState>>(new Map());
  const [autoTranslate, setAutoTranslateState] = useState<boolean>(() => {
    return localStorage.getItem('vex_auto_translate') === 'true';
  });
  const [targetLanguage, setTargetLanguageState] = useState<string>(() => {
    return localStorage.getItem('vex_translate_target') || uiLanguage || 'en';
  });
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  // Sync target language when UI language changes (if user hasn't explicitly set one)
  useEffect(() => {
    if (!localStorage.getItem('vex_translate_target')) {
      setTargetLanguageState(uiLanguage || 'en');
    }
  }, [uiLanguage]);

  const setAutoTranslate = useCallback((enabled: boolean) => {
    setAutoTranslateState(enabled);
    localStorage.setItem('vex_auto_translate', String(enabled));
  }, []);

  const setTargetLanguage = useCallback((langCode: string) => {
    setTargetLanguageState(langCode);
    localStorage.setItem('vex_translate_target', langCode);
    // Clear existing translations so they re-translate in new language
    setStates(new Map());
  }, []);

  const translateMessage = useCallback(async (messageId: string, text: string): Promise<string | null> => {
    // Cancel any pending translation for this message
    const existing = abortControllers.current.get(messageId);
    if (existing) existing.abort();

    const controller = new AbortController();
    abortControllers.current.set(messageId, controller);

    setStates(prev => {
      const next = new Map(prev);
      next.set(messageId, {
        translatedText: prev.get(messageId)?.translatedText || null,
        isTranslating: true,
        error: null,
        showOriginal: false,
      });
      return next;
    });

    try {
      const response = await fetch('/api/chat/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceLang: 'auto',
          targetLang: targetLanguage,
        }),
        signal: controller.signal,
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Translation failed');

      const data = await response.json() as { translatedText: string };

      setStates(prev => {
        const next = new Map(prev);
        next.set(messageId, {
          translatedText: data.translatedText,
          isTranslating: false,
          error: null,
          showOriginal: false,
        });
        return next;
      });

      return data.translatedText;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;

      setStates(prev => {
        const next = new Map(prev);
        next.set(messageId, {
          translatedText: null,
          isTranslating: false,
          error: 'Translation failed',
          showOriginal: true,
        });
        return next;
      });
      return null;
    } finally {
      abortControllers.current.delete(messageId);
    }
  }, [targetLanguage]);

  const getDisplayText = useCallback((messageId: string, originalText: string): string => {
    const state = states.get(messageId);
    if (!state) return originalText;
    if (state.showOriginal || !state.translatedText) return originalText;
    return state.translatedText;
  }, [states]);

  const getTranslatedText = useCallback((messageId: string): string | null => {
    return states.get(messageId)?.translatedText || null;
  }, [states]);

  const hasTranslation = useCallback((messageId: string): boolean => {
    return !!states.get(messageId)?.translatedText;
  }, [states]);

  const toggleTranslation = useCallback((messageId: string, originalText: string) => {
    const state = states.get(messageId);

    if (!state || (!state.translatedText && !state.isTranslating)) {
      // Not translated yet — start translation
      translateMessage(messageId, originalText);
      return;
    }

    // Toggle between original and translated
    setStates(prev => {
      const next = new Map(prev);
      const current = prev.get(messageId);
      if (current) {
        next.set(messageId, { ...current, showOriginal: !current.showOriginal });
      }
      return next;
    });
  }, [states, translateMessage]);

  const isTranslating = useCallback((messageId: string): boolean => {
    return states.get(messageId)?.isTranslating ?? false;
  }, [states]);

  const isShowingOriginal = useCallback((messageId: string): boolean => {
    const state = states.get(messageId);
    if (!state) return true;
    return state.showOriginal || !state.translatedText;
  }, [states]);

  const currentLanguageInfo = ALL_LANGUAGES.find(l => l.code === targetLanguage);

  return {
    getDisplayText,
    getTranslatedText,
    hasTranslation,
    toggleTranslation,
    isTranslating,
    isShowingOriginal,
    autoTranslate,
    setAutoTranslate,
    translateMessage,
    targetLanguage,
    setTargetLanguage,
    languages: ALL_LANGUAGES,
    currentLanguageInfo,
  };
}
