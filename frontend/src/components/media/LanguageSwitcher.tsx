// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';
import { useI18n, type Locale } from '@/i18n';
import { cn } from '@/lib/utils';

const LANGUAGES: { locale: Locale; label: string; flag: string }[] = [
  { locale: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { locale: 'en', label: 'English', flag: '🇺🇸' },
];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const current = LANGUAGES.find((l) => l.locale === locale) || LANGUAGES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-all',
          'text-gray-400 hover:text-white hover:bg-white/5'
        )}
        title={current.label}
      >
        <span className="text-base">{current.flag}</span>
        <Globe className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl overflow-hidden z-50">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.locale}
              onClick={() => {
                setLocale(lang.locale);
                setOpen(false);
              }}
              className={cn(
                'flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors',
                locale === lang.locale
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              )}
            >
              <span className="text-base">{lang.flag}</span>
              <span className="flex-1 text-left">{lang.label}</span>
              {locale === lang.locale && (
                <Check className="w-3.5 h-3.5 text-sky-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
