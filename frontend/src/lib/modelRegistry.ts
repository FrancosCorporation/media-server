// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
/**
 * Registry de Modelos (Frontend) — Ultra-Simples
 *
 * O backend agora envia { id, displayName } já limpo.
 * Este arquivo é apenas um fallback para casos extremos
 * (ex: falha de rede, modelo não mapeado no backend).
 *
 * Sem loops, sem regex, sem prefix match. Apenas objeto estático.
 */

const FALLBACK_NAMES: Record<string, string> = {
  'qwen3.5:9b': 'Qwen 3.5 (9B)',
  'codestral:latest': 'CodeStral',
  'gemma3:12b-chat-geral': 'Gemma 3 (12B)',
  'llama3.1-8b-cpu': 'Llama 3.1 (8B)',
  'mistral-nemo:12b': 'Mistral Nemo (12B)',
  'nemotron-3-nano:4b': 'Nemotron 3 (4B)',
};

/**
 * Retorna nome amigável para exibição no chat.
 * Usa o objeto estático → fallback: extrai nome base do ID.
 * Sem loops de prefixo, sem regex complexos.
 */
export function getModelDisplayName(modelId: string): string {
  if (!modelId) return 'IA';

  // Match exato no fallback
  const exact = FALLBACK_NAMES[modelId];
  if (exact) return exact;

  // Fallback: remove criador e :latest
  const cleaned = modelId
    .replace(/^hf\.co\/[^/]+\//i, '')
    .replace(/:latest.*$/i, '')
    .split(':')[0]
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

  return cleaned || 'IA';
}
