// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Save, RotateCcw, Sparkles, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSystemPrompts } from '../contexts/SystemPromptsContext';
import { apiFetch } from '../lib/api';

interface Model {
  id: string;
  displayName: string;
}

const SUGGESTED_PROMPTS = [
  {
    label: 'Revisor de Código',
    prompt: `Você é um revisor de código sênior especializado em boas práticas, performance e segurança.

Regras:
- Analise o código fornecido e aponte problemas de qualidade
- Sugira melhorias com exemplos de código corrigido
- Destaque vulnerabilidades de segurança
- Comente sobre performance e boas práticas
- Seja objetivo e direto nas críticas
- Use bullet points para organizar a revisão`,
  },
  {
    label: 'Tradutor Técnico',
    prompt: `Você é um tradutor técnico especializado em documentação de software.

Regras:
- Traduza mantendo a terminologia técnica precisa
- Preserve nomes de funções, variáveis e comandos sem tradução
- Adapte o tom ao contexto (formal para docs, casual para chats)
- Quando houver ambiguidade, explique a escolha de tradução
- Mantenha links e formatação original`,
  },
  {
    label: 'Especialista em Dados',
    prompt: `Você é um analista de dados experiente que ajuda a interpretar dados e gerar insights.

Regras:
- Explique padrões e tendências nos dados fornecidos
- Sugira visualizações apropriadas para cada tipo de dado
- Aponte anomalias e outliers
- Recomende análises estatísticas relevantes
- Evite jargon excessivo; explique termos técnicos
- Sempre contextualize os números com comparações significativas`,
  },
  {
    label: 'Assistente Criativo',
    prompt: `Você é um assistente criativo especializado em geração de conteúdo original.

Regras:
- Gere ideias inovadoras e fora da caixa
- Adapte o tom ao público-alvo especificado
- Ofereça múltiplas alternativas quando apropriado
- Use storytelling para engajar o leitor
- Peça feedback para refinar as sugestões
- Inclua exemplos concretos sempre que possível`,
  },
];

export default function AgentSettings() {
  const { getSystemPrompt, setSystemPrompt, getAllPrompts, hasSystemPrompt } = useSystemPrompts();
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [promptText, setPromptText] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Carrega modelos disponíveis
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    apiFetch('/chat/models', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.models?.length > 0) {
          const MODELS_TO_IGNORE = [
            'gemma4:e4b-falso-gemma',
            'hf.co/mradermacher/gemma-4-E4B-it-Claude-Opus-4.5-HERETIC-UNCENSORED-Thinking-i1-GGUF:Q6_K',
            'hf.co/muzerai/DeepSeek-R1-Distill-Llama-8B-Code-De-AIJOAH-GGUF:Q8_0-raciocinio',
            'qwen3.5:9b-falso-qwen',
          ];

          function getModelSize(model: Model): number {
            const match = model.displayName.match(/\((\d+(?:\.\d+)?)\s*B\)/i);
            if (match) return parseFloat(match[1]);
            if (model.displayName.toLowerCase().includes('nano')) return 0.5;
            return 999;
          }

          const filtered = data.models
            .filter((m: Model) => !MODELS_TO_IGNORE.includes(m.id))
            .sort((a: Model, b: Model) => getModelSize(a) - getModelSize(b));

          setModels(filtered);
          if (filtered.length > 0) {
            setSelectedModel(filtered[0].id);
          }
        }
      })
      .catch(() => {
        // Fallback para modelos padrão
        setModels([
          { id: 'qwen3.5:9b', displayName: 'Qwen 3.5 9B' },
          { id: 'llama3.2', displayName: 'Llama 3.2' },
        ]);
        setSelectedModel('qwen3.5:9b');
      });
  }, []);

  // Carrega o prompt quando o modelo selecionado muda
  useEffect(() => {
    if (selectedModel) {
      setPromptText(getSystemPrompt(selectedModel));
      setIsDirty(false);
      setSaved(false);
    }
  }, [selectedModel, getSystemPrompt]);

  const handleSave = useCallback(() => {
    setSystemPrompt(selectedModel, promptText);
    setIsDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [selectedModel, promptText, setSystemPrompt]);

  const handleReset = useCallback(() => {
    setPromptText('');
    setSystemPrompt(selectedModel, '');
    setIsDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [selectedModel, setSystemPrompt]);

  const applySuggestion = useCallback((prompt: string) => {
    setPromptText(prompt);
    setIsDirty(true);
    setShowSuggestions(false);
  }, []);

  const activeCount = Object.keys(getAllPrompts()).filter((m) => hasSystemPrompt(m)).length;

  return (
    <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl border border-white/5 p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot size={20} className="text-primary-light" />
            Agentes Inteligentes
          </h3>
          <p className="text-sm text-[#A1A1AA] mt-1">
            Configure instruções personalizadas para cada modelo de IA.
            {activeCount > 0 && (
              <span className="text-primary-light ml-1">
                {activeCount} agente{activeCount > 1 ? 's' : ''} ativo{activeCount > 1 ? 's' : ''}.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Model Selector */}
      <div>
        <label className="block text-sm font-medium text-[#A1A1AA] mb-2">
          Modelo
        </label>
        <div className="relative">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white appearance-none cursor-pointer focus:border-primary/50 outline-none transition-all"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none"
          />
        </div>
      </div>

      {/* Selected model status */}
      {hasSystemPrompt(selectedModel) && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
          <Sparkles size={16} className="text-primary-light flex-shrink-0" />
          <p className="text-sm text-primary-light/80">
            Este modelo possui um prompt personalizado. Ele será enviado como instrução
            de sistema sempre que você usar <strong className="text-violet-200">{models.find(m => m.id === selectedModel)?.displayName || selectedModel}</strong> no chat.
          </p>
        </div>
      )}

      {/* Prompt Textarea */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[#A1A1AA]">
            Instruções de Sistema (System Prompt)
          </label>
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="text-xs text-primary-light hover:text-primary-light/80 transition-colors flex items-center gap-1"
          >
            <Sparkles size={12} />
            Sugestões de prompts
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && (
          <div className="mb-3 p-3 rounded-xl bg-[#0D1117] border border-white/5 space-y-2">
            <p className="text-xs text-[#6B7280] mb-2">Escolha um template para começar:</p>
            {SUGGESTED_PROMPTS.map((s) => (
              <button
                key={s.label}
                onClick={() => applySuggestion(s.prompt)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary/10 text-sm text-[#A1A1AA] hover:text-primary-light/80 transition-colors border border-transparent hover:border-primary/20"
              >
                <span className="font-medium">{s.label}</span>
                <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-1">{s.prompt.slice(0, 80)}...</p>
              </button>
            ))}
          </div>
        )}

        <textarea
          value={promptText}
          onChange={(e) => {
            setPromptText(e.target.value);
            setIsDirty(true);
            setSaved(false);
          }}
          placeholder={`Ex: "Você é um assistente especializado em React e TypeScript. Sempre forneça exemplos de código e explique boas práticas."`}
          rows={10}
          className="w-full px-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all resize-y font-mono text-sm leading-relaxed"
        />
        <p className="text-xs text-[#6B7280] mt-2 flex items-center gap-1">
          <AlertCircle size={12} />
          O prompt será injetado como mensagem de sistema antes de cada conversa com este modelo.
          {promptText.length > 0 && (
            <span className="text-primary-light ml-auto">{promptText.length} caracteres</span>
          )}
        </p>
      </div>

      {/* Preview */}
      {promptText.trim() && (
        <div className="p-4 rounded-xl bg-[#0D1117]/50 border border-white/5">
          <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider mb-2">
            Preview de como será enviado:
          </p>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-xs font-mono text-primary-light bg-primary/10 px-2 py-0.5 rounded mt-0.5 flex-shrink-0">
                system
              </span>
              <p className="text-xs text-[#A1A1AA] leading-relaxed whitespace-pre-wrap line-clamp-4">
                {promptText}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded mt-0.5 flex-shrink-0">
                user
              </span>
              <p className="text-xs text-[#6B7280] italic">
                [sua mensagem será inserida aqui]
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all ${
            saved && !isDirty
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          {saved && !isDirty ? (
            <>
              <CheckCircle2 size={16} />
              Salvo!
            </>
          ) : (
            <>
              <Save size={16} />
              Salvar Prompt
            </>
          )}
        </button>

        {hasSystemPrompt(selectedModel) && (
          <button
            onClick={handleReset}
            className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white text-sm font-medium transition-colors border border-white/5 flex items-center gap-2"
          >
            <RotateCcw size={14} />
            Remover
          </button>
        )}
      </div>

      {/* Lista de agentes configurados */}
      {activeCount > 0 && (
        <div className="pt-4 border-t border-white/5">
          <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider mb-3">
            Agentes Ativos ({activeCount})
          </p>
          <div className="space-y-2">
            {Object.entries(getAllPrompts()).map(([modelId, prompt]) =>
              prompt.trim() ? (
                <div
                  key={modelId}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/10"
                >
                  <Sparkles size={14} className="text-primary-light flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {models.find((m) => m.id === modelId)?.displayName || modelId}
                    </p>
                    <p className="text-xs text-[#6B7280] truncate">{prompt.slice(0, 60)}...</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedModel(modelId);
                      setPromptText(getSystemPrompt(modelId));
                    }}
                    className="text-xs text-primary-light hover:text-primary-light/80 transition-colors flex-shrink-0"
                  >
                    Editar
                  </button>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}
