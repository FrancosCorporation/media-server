// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

const STORAGE_KEY = 'francos-system-prompts';

interface SystemPromptsContextType {
  /** Retorna o system prompt configurado para um modelo */
  getSystemPrompt: (modelId: string) => string;
  /** Salva o system prompt para um modelo */
  setSystemPrompt: (modelId: string, prompt: string) => void;
  /** Remove o system prompt de um modelo */
  removeSystemPrompt: (modelId: string) => void;
  /** Retorna TODOS os prompts configurados */
  getAllPrompts: () => Record<string, string>;
  /** Verifica se um modelo tem prompt customizado */
  hasSystemPrompt: (modelId: string) => boolean;
}

const SystemPromptsContext = createContext<SystemPromptsContextType | null>(null);

function loadPrompts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    }
  } catch {
    // localStorage corrompido ou indisponível
  }
  return {};
}

function savePrompts(prompts: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  } catch {
    // localStorage cheio ou indisponível
  }
}

export function SystemPromptsProvider({ children }: { children: ReactNode }) {
  const [prompts, setPrompts] = useState<Record<string, string>>(loadPrompts);

  // Persiste automaticamente sempre que o estado muda
  useEffect(() => {
    savePrompts(prompts);
  }, [prompts]);

  const getSystemPrompt = useCallback((modelId: string): string => {
    return prompts[modelId] || '';
  }, [prompts]);

  const setSystemPrompt = useCallback((modelId: string, prompt: string) => {
    setPrompts((prev) => {
      const next = { ...prev };
      if (prompt.trim()) {
        next[modelId] = prompt.trim();
      } else {
        delete next[modelId];
      }
      return next;
    });
  }, []);

  const removeSystemPrompt = useCallback((modelId: string) => {
    setPrompts((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  }, []);

  const getAllPrompts = useCallback((): Record<string, string> => {
    return { ...prompts };
  }, [prompts]);

  const hasSystemPrompt = useCallback((modelId: string): boolean => {
    return !!prompts[modelId]?.trim();
  }, [prompts]);

  return (
    <SystemPromptsContext.Provider
      value={{
        getSystemPrompt,
        setSystemPrompt,
        removeSystemPrompt,
        getAllPrompts,
        hasSystemPrompt,
      }}
    >
      {children}
    </SystemPromptsContext.Provider>
  );
}

export function useSystemPrompts(): SystemPromptsContextType {
  const context = useContext(SystemPromptsContext);
  if (!context) {
    throw new Error('useSystemPrompts deve ser usado dentro de SystemPromptsProvider');
  }
  return context;
}
