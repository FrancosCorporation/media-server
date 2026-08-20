// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import ptBR from './pt-BR.json';
import en from './en.json';

type Locale = 'pt-BR' | 'en';

const translations: Record<Locale, typeof ptBR> = {
  'pt-BR': ptBR,
  'en': en,
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  translateGenre: (genre: string | number) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getNestedValue(obj: any, path: string): string | undefined {
  if (!path) return undefined;
  return path.split('.').reduce((current, key) => current?.[key], obj) as string | undefined;
}

function loadLocale(): Locale {
  return 'pt-BR';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(loadLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      const settings = JSON.parse(localStorage.getItem('media_settings') || '{}');
      settings.uiLanguage = newLocale;
      localStorage.setItem('media_settings', JSON.stringify(settings));
    } catch {}
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(translations[locale], key);
    if (!value) return key;

    if (!params) return value;

    return Object.entries(params).reduce(
      (result, [paramKey, paramValue]) => result.replace(`{${paramKey}}`, String(paramValue)),
      value
    );
  }, [locale]);

  const translateGenre = useCallback((genre: string | number): string => {
    const str = typeof genre === 'number' ? String(genre) : genre;
    const lower = str.toLowerCase();
    // Try direct lookup first
    const genreKey = `genres.${lower}`;
    const translated = getNestedValue(translations[locale], genreKey);
    if (translated) return translated;
    // Fallback: strip accents and try again (e.g., "Ficção" → "ficcao")
    const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalized !== lower) {
      const normKey = `genres.${normalized}`;
      const normTranslated = getNestedValue(translations[locale], normKey);
      if (normTranslated) return normTranslated;
    }
    return str;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, translateGenre }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export type { Locale };
