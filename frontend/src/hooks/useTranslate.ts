// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { useState, useCallback, useRef } from 'react';
import { mediaApi } from '@/services/media/api';

/**
 * Hook para traduzir textos on-the-fly.
 * Mantém cache local para não traduzir o mesmo texto duas vezes.
 *
 * Uso:
 *   const { translate, translateMedia } = useTranslate();
 *   const translated = await translate("Hello world");
 */
export function useTranslate() {
  const [isTranslating, setIsTranslating] = useState(false);
  const cacheRef = useRef<Map<string, string>>(new Map());

  const getTargetLang = useCallback((): string => {
    // Lê o idioma das configurações salvas
    try {
      const settings = localStorage.getItem('media_settings');
      if (settings) {
        const parsed = JSON.parse(settings);
        return parsed.uiLanguage || 'pt-BR';
      }
    } catch {}
    return 'pt-BR';
  }, []);

  const translate = useCallback(async (text: string, from = 'en'): Promise<string> => {
    if (!text || text.trim().length === 0) return text;

    const to = getTargetLang();
    if (to === from) return text;

    const cacheKey = `${from}:${to}:${text}`;
    if (cacheRef.current.has(cacheKey)) {
      return cacheRef.current.get(cacheKey)!;
    }

    try {
      const result = await mediaApi.translate(text, from, to);
      cacheRef.current.set(cacheKey, result.translated);
      return result.translated;
    } catch {
      return text;
    }
  }, [getTargetLang]);

  const translateMedia = useCallback(async (item: any): Promise<any> => {
    if (!item) return item;

    const to = getTargetLang();
    if (to === 'en') return item;

    try {
      const result = await mediaApi.translateMedia(item, to);
      return result.item;
    } catch {
      return item;
    }
  }, [getTargetLang]);

  const translateBatch = useCallback(async (texts: string[], from = 'en'): Promise<string[]> => {
    if (!texts.length) return texts;

    const to = getTargetLang();
    if (to === from) return texts;

    // Verifica cache para cada texto
    const uncached: { index: number; text: string }[] = [];
    const results: string[] = texts.map((t) => {
      const cacheKey = `${from}:${to}:${t}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) return cached;
      uncached.push({ index: results?.length ?? 0, text: t });
      return t;
    });

    if (uncached.length === 0) return results;

    try {
      const translated = await mediaApi.translateBatch(uncached.map(u => u.text), from, to);
      uncached.forEach((u, i) => {
        results[u.index] = translated.translated[i];
        cacheRef.current.set(`${from}:${to}:${u.text}`, translated.translated[i]);
      });
    } catch {}

    return results;
  }, [getTargetLang]);

  return { translate, translateMedia, translateBatch, isTranslating };
}
