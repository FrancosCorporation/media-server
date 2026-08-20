// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import axios from 'axios';
import { logger } from '../utils/logger';

const COMPONENT = 'TranslationService';

// Cache em memória para traduções (evita chamadas repetidas)
const cache = new Map<string, string>();
const CACHE_MAX = 2000;

// Throttle global: MyMemory gratuito limita ~1 req/s por IP.
// Serializa as chamadas com um intervalo mínimo para não estourar 429.
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

function throttled(): Promise<void> {
  const run = async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

/** Retry com backoff para 429 (rate limit) — até 3 tentativas */
async function withRetry(fn: () => Promise<any>): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429 && attempt < 2) {
        const delay = 2000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('retry exhausted');
}

/**
 * Traduz texto de um idioma para outro usando a API gratuita MyMemory.
 * https://mymemory.translated.net/doc/spec.php
 *
 * Limites gratuitos: 5000 chars/dia, mas suficiente para descrições de filmes.
 * Cache em memória para não traduzir o mesmo texto duas vezes.
 */
async function translate(text: string, from: string = 'en', to: string = 'pt-BR'): Promise<string> {
  if (!text || text.trim().length === 0) return text;
  if (from === to) return text;

  const cacheKey = `${from}:${to}:${text}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  try {
    // MyMemory aceita no máximo 500 chars por request
    // Se o texto for maior, traduz em pedaços
    const chunks = splitText(text, 480);
    const translatedChunks: string[] = [];

    for (const chunk of chunks) {
      // Serializa chamadas (MyMemory limita ~1 req/s)
      await throttled();
      const { data } = await withRetry(() =>
        axios.get('https://api.mymemory.translated.net/get', {
          params: {
            q: chunk,
            langpair: `${from}|${to}`,
          },
          timeout: 15000,
        })
      );

      if (data?.responseData?.translatedText) {
        translatedChunks.push(data.responseData.translatedText);
      } else {
        // Fallback: retorna o texto original se a tradução falhar
        translatedChunks.push(chunk);
      }
    }

    const result = translatedChunks.join(' ');

    // Salva no cache
    if (cache.size >= CACHE_MAX) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(cacheKey, result);

    return result;
  } catch (err: any) {
    logger.warn(COMPONENT, `Translation failed: ${err.message}`);
    return text;
  }
}

/**
 * Traduz múltiplos textos de uma vez (batch).
 * Útil para traduzir listas de filmes/séries.
 */
async function translateBatch(texts: string[], from: string = 'en', to: string = 'pt-BR'): Promise<string[]> {
  if (from === to) return texts;

  const results: string[] = [];
  for (const text of texts) {
    const translated = await translate(text, from, to);
    results.push(translated);
  }
  return results;
}

/**
 * Traduz objetos de mídia (filmes/séries), preservando todos os campos
 * e traduzindo apenas overview e genres.
 */
async function translateMediaItem(item: any, to: string = 'pt-BR'): Promise<any> {
  if (to === 'en' || !item) return item;

  const translated = { ...item };

  if (item.overview) {
    translated.overview = await translate(item.overview, 'en', to);
  }

  if (item.genres && Array.isArray(item.genres)) {
    translated.genres = await translateBatch(item.genres, 'en', to);
  }

  return translated;
}

/**
 * Divide texto em pedaços respeitando limites de tamanho.
 * Tenta quebrar em frases (pontos) para manter coerência.
 */
function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Tenta quebrar no último ponto antes do limite
    let breakAt = remaining.lastIndexOf('. ', maxLen);
    if (breakAt < maxLen * 0.3) {
      // Se o ponto está muito no início, tenta espaço
      breakAt = remaining.lastIndexOf(' ', maxLen);
    }
    if (breakAt < maxLen * 0.3) {
      // Se não achou ponto nem espaço razoável, quebra no limite
      breakAt = maxLen;
    } else {
      breakAt += 1; // Inclui o ponto/espaço
    }

    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  return chunks;
}

export const TranslationService = {
  translate,
  translateBatch,
  translateMediaItem,
};
