// Locale registry with lazy loading support
// Each language is loaded on-demand via dynamic import() to reduce bundle size

import type { Language } from '@/lib/i18n';

export type TranslationMap = Record<string, string>;

// Eagerly loaded: English (always used as fallback)
import en from './en';
export { en };

// Lazy loaders for all other languages
// Each returns a Promise<TranslationMap> from its respective locale file
const loaders: Partial<Record<Language, () => Promise<TranslationMap>>> = {
  // Original 39 languages (excluding English which is eager-loaded)
  ar: () => import('./ar').then(m => m.default),
  fr: () => import('./fr').then(m => m.default),
  es: () => import('./es').then(m => m.default),
  de: () => import('./de').then(m => m.default),
  tr: () => import('./tr').then(m => m.default),
  zh: () => import('./zh').then(m => m.default),
  hi: () => import('./hi').then(m => m.default),
  pt: () => import('./pt').then(m => m.default),
  ru: () => import('./ru').then(m => m.default),
  ja: () => import('./ja').then(m => m.default),
  ko: () => import('./ko').then(m => m.default),
  it: () => import('./it').then(m => m.default),
  nl: () => import('./nl').then(m => m.default),
  pl: () => import('./pl').then(m => m.default),
  id: () => import('./id').then(m => m.default),
  ms: () => import('./ms').then(m => m.default),
  th: () => import('./th').then(m => m.default),
  vi: () => import('./vi').then(m => m.default),
  fa: () => import('./fa').then(m => m.default),
  ur: () => import('./ur').then(m => m.default),
  he: () => import('./he').then(m => m.default),
  bn: () => import('./bn').then(m => m.default),
  sv: () => import('./sv').then(m => m.default),
  no: () => import('./no').then(m => m.default),
  da: () => import('./da').then(m => m.default),
  fi: () => import('./fi').then(m => m.default),
  el: () => import('./el').then(m => m.default),
  cs: () => import('./cs').then(m => m.default),
  ro: () => import('./ro').then(m => m.default),
  hu: () => import('./hu').then(m => m.default),
  uk: () => import('./uk').then(m => m.default),
  bg: () => import('./bg').then(m => m.default),
  hr: () => import('./hr').then(m => m.default),
  sk: () => import('./sk').then(m => m.default),
  sl: () => import('./sl').then(m => m.default),
  sr: () => import('./sr').then(m => m.default),
  lt: () => import('./lt').then(m => m.default),
  lv: () => import('./lv').then(m => m.default),
  et: () => import('./et').then(m => m.default),
  // Extended 69 languages
  af: () => import('./af').then(m => m.default),
  sq: () => import('./sq').then(m => m.default),
  am: () => import('./am').then(m => m.default),
  hy: () => import('./hy').then(m => m.default),
  az: () => import('./az').then(m => m.default),
  eu: () => import('./eu').then(m => m.default),
  be: () => import('./be').then(m => m.default),
  bs: () => import('./bs').then(m => m.default),
  ca: () => import('./ca').then(m => m.default),
  ceb: () => import('./ceb').then(m => m.default),
  'zh-TW': () => import('./zh_TW').then(m => m.default),
  co: () => import('./co').then(m => m.default),
  eo: () => import('./eo').then(m => m.default),
  fy: () => import('./fy').then(m => m.default),
  gl: () => import('./gl').then(m => m.default),
  ka: () => import('./ka').then(m => m.default),
  gu: () => import('./gu').then(m => m.default),
  ht: () => import('./ht').then(m => m.default),
  ha: () => import('./ha').then(m => m.default),
  haw: () => import('./haw').then(m => m.default),
  hmn: () => import('./hmn').then(m => m.default),
  is: () => import('./is').then(m => m.default),
  ig: () => import('./ig').then(m => m.default),
  ga: () => import('./ga').then(m => m.default),
  jv: () => import('./jv').then(m => m.default),
  kn: () => import('./kn').then(m => m.default),
  kk: () => import('./kk').then(m => m.default),
  km: () => import('./km').then(m => m.default),
  rw: () => import('./rw').then(m => m.default),
  ku: () => import('./ku').then(m => m.default),
  ky: () => import('./ky').then(m => m.default),
  lo: () => import('./lo').then(m => m.default),
  la: () => import('./la').then(m => m.default),
  lb: () => import('./lb').then(m => m.default),
  mk: () => import('./mk').then(m => m.default),
  mg: () => import('./mg').then(m => m.default),
  ml: () => import('./ml').then(m => m.default),
  mt: () => import('./mt').then(m => m.default),
  mi: () => import('./mi').then(m => m.default),
  mr: () => import('./mr').then(m => m.default),
  mn: () => import('./mn').then(m => m.default),
  my: () => import('./my').then(m => m.default),
  ne: () => import('./ne').then(m => m.default),
  ny: () => import('./ny').then(m => m.default),
  or: () => import('./or').then(m => m.default),
  ps: () => import('./ps').then(m => m.default),
  pa: () => import('./pa').then(m => m.default),
  sm: () => import('./sm').then(m => m.default),
  gd: () => import('./gd').then(m => m.default),
  st: () => import('./st').then(m => m.default),
  sn: () => import('./sn').then(m => m.default),
  sd: () => import('./sd').then(m => m.default),
  si: () => import('./si').then(m => m.default),
  so: () => import('./so').then(m => m.default),
  su: () => import('./su').then(m => m.default),
  sw: () => import('./sw').then(m => m.default),
  tl: () => import('./tl').then(m => m.default),
  tg: () => import('./tg').then(m => m.default),
  ta: () => import('./ta').then(m => m.default),
  tt: () => import('./tt').then(m => m.default),
  te: () => import('./te').then(m => m.default),
  tk: () => import('./tk').then(m => m.default),
  ug: () => import('./ug').then(m => m.default),
  uz: () => import('./uz').then(m => m.default),
  cy: () => import('./cy').then(m => m.default),
  xh: () => import('./xh').then(m => m.default),
  yi: () => import('./yi').then(m => m.default),
  yo: () => import('./yo').then(m => m.default),
  zu: () => import('./zu').then(m => m.default),
};

// Cache loaded translations in memory
const cache = new Map<Language, TranslationMap>();
cache.set('en', en);

/**
 * Load translations for a language.
 * Returns cached result if already loaded.
 * Falls back to English if no loader is registered.
 */
export async function loadTranslations(lang: Language): Promise<TranslationMap> {
  // Check cache first
  const cached = cache.get(lang);
  if (cached) return cached;

  // Try dynamic import
  const loader = loaders[lang];
  if (loader) {
    try {
      const translations = await loader();
      cache.set(lang, translations);
      return translations;
    } catch (err) {
      console.error(`[i18n] Failed to load translations for "${lang}":`, err);
    }
  }

  // Fallback to English
  return en;
}

/**
 * Get cached translations synchronously.
 * Returns undefined if not yet loaded (use loadTranslations first).
 */
export function getCachedTranslations(lang: Language): TranslationMap | undefined {
  return cache.get(lang);
}

/**
 * Check if translations for a language are already cached.
 */
export function isLanguageCached(lang: Language): boolean {
  return cache.has(lang);
}

/**
 * Preload multiple languages in parallel.
 */
export async function preloadLanguages(langs: Language[]): Promise<void> {
  await Promise.allSettled(langs.map(loadTranslations));
}
