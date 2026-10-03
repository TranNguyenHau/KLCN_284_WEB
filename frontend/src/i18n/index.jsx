import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from '../locales/en.json';
import vi from '../locales/vi.json';
import { setFormatLocale } from '../utils/format.js';

const DICTS = { en, vi };

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', short: 'EN', flag: '🇬🇧', locale: 'en-US' },
  { code: 'vi', label: 'Vietnamese', native: 'Tiếng Việt', short: 'VI', flag: '🇻🇳', locale: 'vi-VN' }
];

const STORAGE_KEY = 'alpha.lang';
const localeOf = (code) => (DICTS[code] ? code : 'en');
const intlLocale = (code) => LANGUAGES.find((l) => l.code === code)?.locale || 'en-US';

function detectedLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTS[saved]) return saved;
    return (navigator.language || '').toLowerCase().startsWith('vi') ? 'vi' : 'en';
  } catch {
    return 'en';
  }
}

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(detectedLanguage);
  const dict = DICTS[localeOf(lang)];

  // Number and date formatting must follow the active language before any child renders.
  setFormatLocale(intlLocale(lang));

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage can be blocked in private modes */
    }
  }, [lang]);

  const t = useCallback(
    (key, vars) => {
      const value = lookup(dict, key);
      if (typeof value !== 'string') return value == null ? key : value;
      return vars ? value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] == null ? match : String(vars[name]))) : value;
    },
    [dict]
  );

  const value = useMemo(
    () => ({
      lang,
      locale: intlLocale(lang),
      languages: LANGUAGES,
      setLang,
      toggleLang: () => setLang((current) => (current === 'en' ? 'vi' : 'en')),
      /** Translate a key. Supports {placeholder} interpolation; returns the key when missing. */
      t,
      /** Translate a key that holds a list (chat suggestions, for example). */
      tList: (key) => {
        const value = lookup(dict, key);
        return Array.isArray(value) ? value : [];
      }
    }),
    [lang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

/** Resolve an indicator name coming from the API to its translated label. */
export const INDICATOR_KEYS = {
  'RSI (14)': 'analysis.rsi',
  'MACD (12, 26, 9)': 'analysis.macd',
  'Bollinger Bands (20, 2)': 'analysis.bollinger',
  'Moving averages': 'analysis.movingAverages',
  Volume: 'analysis.volume'
};
