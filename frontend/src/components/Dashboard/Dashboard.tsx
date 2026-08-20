// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Settings, LogOut, ChevronDown, Home, PanelLeftClose, PanelRightClose, User, Mail, RefreshCw, AlertCircle, CheckCircle2, LayoutGrid } from 'lucide-react';
import ChatSidebar from './ChatSidebar';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import { useSystemPrompts } from '../../contexts/SystemPromptsContext';
import { apiBase } from '../../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  _id?: string;
  /** ID local único para key estável durante otimistic updates */
  _localId?: string;
}

interface Conversation {
  _id: string;
  title: string;
  model?: string;
  messages?: Message[];
  lastActivityAt: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<{ id: string; displayName: string; parameterSize?: string; sizeGB?: number }[]>([{ id: 'qwen3.5:9b', displayName: 'Qwen 3.5 9B' }]);
  const [selectedModel, setSelectedModel] = useState('qwen3.5:9b');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [userName, setUserName] = useState('');

  // ─── Estado de aviso de contexto (conversa muito longa) ───────
  const [contextWarning, setContextWarning] = useState<string | null>(null);

  const toast = useToast();
  const { getSystemPrompt } = useSystemPrompts();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Contador para gerar IDs locais únicos (keys estáveis)
  const localIdCounter = useRef(0);

  // Auto-scroll para o final quando novas mensagens chegam
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Estado para verificação de e-mail
  const [userEmail, setUserEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  const token = localStorage.getItem('accessToken');

  const resendTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup do timer ao desmontar
  useEffect(() => {
    return () => {
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  const startResendTimer = () => {
    setResendTimer(60);
    resendTimerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Carrega dados do usuario + status de verificação
  useEffect(() => {
    if (!token) return;
    
    // Tenta carregar foto do localStorage (salva pelo OAuthSuccess)
    const cachedUser = localStorage.getItem('user');
    if (cachedUser) {
      try {
        const parsed = JSON.parse(cachedUser);
        if (parsed.photo) {
          setUserPhoto(`${parsed.photo}?t=${Date.now()}`);
        }
        if (parsed.name) setUserName(parsed.name);
        if (parsed.email) setUserEmail(parsed.email);
      } catch {}
    }
    
    const fetchUserData = async () => {
      try {
        // Tenta pegar dados do /me (que inclui emailVerified e photo)
        const res = await apiFetch('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
          skipAuthRedirect: true,
        });
        if (res.ok) {
          const data = await res.json();
          setUserEmail(data.email || '');
          setUserName(data.name || '');
          // emailVerified pode ser undefined para contas antigas (considera verificado)
          setEmailVerified(data.emailVerified !== false);
          // /me agora retorna photo (corrigido)
          if (data.photo) {
            setUserPhoto(`${data.photo}?t=${Date.now()}`);
          }
          return; // Sai aqui se deu certo
        }
        // Se /auth/me retornou 401 (token de servidor diferente), não redireciona
        // — o Dashboard funciona com dados do JWT decodificado no OAuthSuccess
        if (res.status === 401) {
          setEmailVerified(true);
          return;
        }
        // Se /me falhou por outro motivo (não 429), tenta /auth/settings como fallback
        if (res.status === 429) {
          setEmailVerified(true);
          return;
        }
        const res2 = await apiFetch('/auth/settings', {
          headers: { Authorization: `Bearer ${token}` },
          skipAuthRedirect: true,
        });
        if (res2.ok) {
          const data = await res2.json();
          if (data.user) {
            setUserEmail(data.user.email || '');
            setUserName(data.user.name || '');
            setEmailVerified(data.user.emailVerified !== false);
            const photoUrl = data.user.photo ? `${data.user.photo}?t=${Date.now()}` : null;
            if (photoUrl) setUserPhoto(photoUrl);
            return; // Sai aqui se deu certo
          }
        }
        // Se ambas as APIs falharam (não ok + sem throw),
        // mesmo assim libera o dashboard assumindo email verificado
        // para não travar o usuário num loading infinito
        setEmailVerified(true);
      } catch {
        // Rede falhou completamente — libera o dashboard mesmo assim
        // para não travar o usuário num loading infinito
        setEmailVerified(true);
      }
    };

    fetchUserData();
  }, [token]);

  const handleResendVerification = async () => {
    if (resendTimer > 0 || !userEmail) return;

    setResendingEmail(true);
    setResendMessage(null);

    try {
      const response = await fetch(`${apiBase()}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        setResendMessage('Link de verificação reenviado! Verifique sua caixa de entrada.');
        startResendTimer();
      } else {
        setResendMessage(data?.error?.message || 'Erro ao reenviar link.');
      }
    } catch {
      setResendMessage('Erro ao conectar com o servidor.');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Usa refs para toast para evitar que fetchModels seja recriado a cada render
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const fetchModels = useCallback(async () => {
    try {
      const res = await apiFetch('/chat/models', {
        headers: { Authorization: `Bearer ${token}` },
        skipAuthRedirect: true,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.models?.length > 0) {
          const MODELS_TO_IGNORE = [
            'gemma4:e4b-falso-gemma',
            'hf.co/mradermacher/gemma-4-E4B-it-Claude-Opus-4.5-HERETIC-UNCENSORED-Thinking-i1-GGUF:Q6_K',
            'hf.co/muzerai/DeepSeek-R1-Distill-Llama-8B-Code-De-AIJOAH-GGUF:Q8_0-raciocinio',
            'qwen3.5:9b-falso-qwen',
          ];

          function getModelSize(model: { id: string; displayName: string; parameterSize?: string; sizeGB?: number }): number {
            if (model.parameterSize) {
              const match = model.parameterSize.match(/([\d.]+)\s*(B|M|K)?/i);
              if (match) {
                const value = parseFloat(match[1]);
                const unit = (match[2] || 'B').toUpperCase();
                if (unit === 'M') return value / 1000;
                if (unit === 'K') return value / 1000000;
                return value;
              }
            }
            const match = model.displayName.match(/\((\d+(?:\.\d+)?)\s*B\)/i);
            if (match) return parseFloat(match[1]);
            if (model.displayName.toLowerCase().includes('nano') || model.displayName.toLowerCase().includes('mini')) return 0.5;
            if (model.sizeGB && model.sizeGB > 0) return model.sizeGB;
            return 999;
          }

          const filtered = data.models
            .filter((m: any) => !MODELS_TO_IGNORE.includes(m.id))
            .sort((a: any, b: any) => {
              const sizeA = getModelSize(a);
              const sizeB = getModelSize(b);
              if (sizeA !== sizeB) return sizeA - sizeB;
              return (a.displayName || '').localeCompare(b.displayName || '');
            });

          setModels(filtered);
          if (filtered.length > 0) {
            setSelectedModel(filtered[0].id);
          }
        }
      } else if (res.status !== 429) {
        // Ignora 429 (rate limit) para não spammar toasts
        toastRef.current.error('Modelos', 'Falha ao carregar modelos do servidor.');
      }
    } catch {
      toastRef.current.warning(
        'Modelos',
        'Usando modelo padrao. Servidor de IA pode estar offline.'
      );
    }
  }, [token]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await apiFetch('/chat/conversations', {
        headers: { Authorization: `Bearer ${token}` },
        skipAuthRedirect: true,
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      // Silencioso: Conversas são opcionais no carregamento inicial
    }
  }, [token]);

  // Ref para evitar fetch duplo no StrictMode
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    Promise.all([fetchModels(), fetchConversations()]).finally(() => setLoading(false));
  }, [token, navigate]);

  const loadConversation = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/chat/conversations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.conversation?.messages || []);
        setActiveConvId(id);
        setSelectedModel(data.conversation?.model || 'qwen3.5:9b');
      }
    } catch (err) {

    }
    setLoading(false);
  }, [token]);

  const handleNewChat = useCallback(async () => {
    setSending(true);
    setShowModelPicker(false);
    try {
      const res = await apiFetch('/chat/conversations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: selectedModel }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveConvId(data.conversation._id);
        setMessages([]);
        await fetchConversations();
      } else {
        toast.error('Novo Chat', 'Falha ao criar nova conversa.');
      }
    } catch {
      toast.error('Novo Chat', 'Erro de conexao ao criar conversa.');
    }
    setSending(false);
  }, [token, selectedModel, fetchConversations, toast]);

  const sendToConversation = useCallback(async (convId: string, content: string) => {
    if (!content?.trim()) return;
    const localId = `msg_${++localIdCounter.current}`;
    const userMsg: Message = { role: 'user', content, _localId: localId };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    // ─── SALVAGUARDA: Garante que o rawName (id) seja sempre enviado ──
    // O selectedModel pode ser um ID antigo ou displayName em alguns casos.
    // Resolvemos o rawName a partir do objeto do modelo para garantir.
    const activeModelObj = models.find(m => m.id === selectedModel);
    const rawModelName = activeModelObj?.id || selectedModel;

    // Recupera o system prompt configurado para o modelo atual
    const systemPrompt = getSystemPrompt(selectedModel);

    try {
      const res = await apiFetch(`/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content,
          model: rawModelName, // ← rawName do Ollama, nunca displayName
          systemPrompt: systemPrompt || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const serverMessages = data.conversation?.messages || [];
        
        // Atualiza aviso de contexto (conversa muito longa)
        if (data.contextWarning && data.contextMessage) {
          setContextWarning(data.contextMessage);
        } else {
          setContextWarning(null);
        }
        
        // Merge: preserva _localId das mensagens existentes para keys estáveis
        setMessages((prev) => {
          const prevById = new Map<string, Message>();
          prev.forEach((m) => {
            if (m._id) prevById.set(m._id, m);
          });
          return serverMessages.map((sm: Message) => {
            const existing = sm._id ? prevById.get(sm._id) : null;
            return existing ? { ...sm, _localId: existing._localId } : sm;
          });
        });
        
        await fetchConversations();
        
        // Verifica se a resposta tem erro do Ollama
        const lastMsg = serverMessages[serverMessages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.content?.startsWith('Desculpe')) {
          toast.warning('IA', 'O servidor de IA nao respondeu. Verifique se o Ollama esta rodando.');
        }
      } else {
        // Tenta extrair erro do body
        try {
          const errData = await res.json();
          const errMessage = errData?.error?.message || 'Falha ao enviar mensagem.';
          toast.error('Erro', errMessage);
          
          // Se for erro de limite de contexto, sugere criar novo chat
          if (errMessage.toLowerCase().includes('limite de mensagens') || 
              errMessage.toLowerCase().includes('atingiu o limite')) {
            setContextWarning(
              'Esta conversa atingiu o limite de mensagens. ' +
              'Crie um Novo Chat para continuar. A conversa atual foi salva e ' +
              'pode ser consultada no histórico.'
            );
          }
        } catch {
          toast.error('Erro', 'Falha ao enviar mensagem. Codigo: ' + res.status);
        }
        // Remove a mensagem do usuario usando _localId (seguro, evita reference equality)
        setMessages((prev) => prev.filter(m => m._localId !== localId));
      }
    } catch {
      toast.error(
        'Conexao',
        'Nao foi possivel conectar ao servidor. Verifique sua conexao.'
      );
      // Remove a mensagem do usuario usando _localId (seguro, evita reference equality)
      setMessages((prev) => prev.filter(m => m._localId !== localId));
    }
    setSending(false);
  }, [token, selectedModel, fetchConversations, toast, getSystemPrompt]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content?.trim()) return;
    if (!activeConvId) {
      // Auto-create conversation on first message
      try {
        const res = await apiFetch('/chat/conversations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ model: selectedModel }),
        });
        if (res.ok) {
          const data = await res.json();
          setActiveConvId(data.conversation._id);
          await fetchConversations();
          // Now send the message to this new conversation
          await sendToConversation(data.conversation._id, content);
        } else {
          toast.error(
            'Conversa',
            'Falha ao criar conversa. Tente novamente.'
          );
        }
      } catch {
        toast.error(
          'Conversa',
          'Erro de conexao ao criar conversa.'
        );
      }
      setSending(false);
      return;
    }
    await sendToConversation(activeConvId, content);
  }, [activeConvId, token, selectedModel, fetchConversations, toast, sendToConversation]);

  const handleDeleteConversation = async (id: string) => {
    try {
      const res = await apiFetch(`/chat/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (activeConvId === id) {
          setActiveConvId(null);
          setMessages([]);
        }
        await fetchConversations();
      } else {
        toast.error('Excluir', 'Falha ao excluir conversa.');
      }
    } catch {
      toast.error('Excluir', 'Erro de conexao ao excluir.');
    }
  };

  // ─── Loading enquanto verifica status do e-mail ────────
  if (emailVerified === null) {
    return (
      <div className="h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-[#A1A1AA] text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  // ─── Overlay de Verificação de E-mail (tela cheia) ────
  if (emailVerified === false) {
    return (
      <div className="h-screen bg-[#0D1117] text-white flex items-center justify-center px-6" role="main" aria-label="Verificação de e-mail necessária">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:6rem_6rem]" />
          <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-md">
          <div className="bg-[#0F172A]/80 backdrop-blur-xl rounded-2xl p-8 border border-white/5 shadow-2xl">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/20" aria-hidden="true">
                <Mail size={40} className="text-white" />
              </div>
              <h1 className="font-display text-2xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent mb-3">
                Verifique seu e-mail
              </h1>
              <p className="text-[#A1A1AA] text-sm leading-relaxed">
                Sua conta ainda não foi verificada. Confirme seu e-mail para acessar o Francos IA.
              </p>
            </div>

            {/* Info */}
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <Mail size={20} className="text-primary-light flex-shrink-0" aria-hidden="true" />
                <p className="text-sm text-[#A1A1AA]">
                  Enviamos um link para <strong className="text-white">{userEmail}</strong>
                </p>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <AlertCircle size={20} className="text-yellow-400 flex-shrink-0" aria-hidden="true" />
                <p className="text-sm text-[#A1A1AA]">
                  Não encontrou? Verifique a caixa de spam ou reenvie o e-mail abaixo.
                </p>
              </div>
            </div>

            {/* Resend feedback */}
            {resendMessage && (
              <div className={`p-4 rounded-xl border flex items-center gap-3 mb-6 ${
                resendMessage.includes('Erro')
                  ? 'bg-red-500/10 border-red-500/20'
                  : 'bg-emerald-500/10 border-emerald-500/20'
              }`} role="alert">
                {resendMessage.includes('Erro') ? (
                  <AlertCircle size={18} className="text-red-400 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" aria-hidden="true" />
                )}
                <p className={`text-sm ${resendMessage.includes('Erro') ? 'text-red-300' : 'text-emerald-300'}`}>
                  {resendMessage}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={handleResendVerification}
                disabled={resendingEmail || resendTimer > 0}
                className="w-full py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-all duration-300 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resendingEmail ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Reenviando...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    <span>{resendTimer > 0 ? `Reenviar em ${resendTimer}s` : 'Reenviar e-mail de verificação'}</span>
                  </>
                )}
              </button>

              {/* Já verifiquei → vai para o login, onde o sistema verifica no BD */}
              <button
                onClick={() => navigate('/login')}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium transition-all duration-300 shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                <span>Já verifiquei meu e-mail</span>
              </button>
            </div>

            {/* Footer */}
            <div className="mt-6 text-center">
              <button
                onClick={handleLogout}
                className="text-sm text-[#A1A1AA]/50 hover:text-[#A1A1AA] transition-colors"
              >
                Sair e voltar ao login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh h-[100dvh] bg-[#0D1117] text-white flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 sm:px-4 h-14 border-b border-white/5 bg-[#0F172A]/95 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelRightClose size={20} />}
          </button>

          <div className="flex items-center gap-2">
            <Bot size={22} className="text-primary-light" />
            <span className="font-display text-lg font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
              Francos IA
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Model picker */}
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs sm:text-sm text-[#A1A1AA] transition-colors max-w-[140px] sm:max-w-none truncate"
            >
              <span className="truncate">{models.find(m => (typeof m === 'string' ? m : m.id) === selectedModel)?.displayName || selectedModel}</span>
              <ChevronDown size={14} />
            </button>

            {showModelPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                <div className="absolute top-full right-0 mt-2 w-64 max-h-80 overflow-y-auto bg-[#0F172A] border border-white/5 rounded-xl shadow-xl p-2 z-50">
                  {models.map((model) => {
                    const modelId = typeof model === 'string' ? model : model.id;
                    const displayName = typeof model === 'string' ? model : model.displayName;
                    return (
                      <button
                        key={modelId}
                        onClick={() => {
                          setSelectedModel(modelId);
                          setShowModelPicker(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedModel === modelId
                            ? 'bg-primary/10 text-primary-light'
                            : 'text-[#A1A1AA] hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {displayName}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Admin (visível apenas para admins) */}
          {(() => {
            try {
              const t = localStorage.getItem('accessToken');
              if (t) {
                const payload = JSON.parse(atob(t.split('.')[1]));
                if (payload.role === 'admin') {
                  return (
                    <button
                      onClick={() => navigate('/adminlea')}
                      className="p-2 rounded-lg hover:bg-amber-500/10 transition-colors text-[#A1A1AA] hover:text-amber-400"
                      title="Painel Admin"
                    >
                      <LayoutGrid size={20} />
                    </button>
                  );
                }
              }
            } catch {}
            return null;
          })()}

          {/* Home */}
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-[#A1A1AA] hover:text-white"
            title="Ir para o site"
          >
            <Home size={20} />
          </button>

          {/* Settings */}
          <button
            onClick={() => navigate('/dashboard/configuracoes')}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-[#A1A1AA] hover:text-white"
            title="Configurações"
          >
            <Settings size={20} />
          </button>

          {/* Avatar / Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-white/5">
            {userPhoto ? (
              <img
                src={userPhoto}
                alt={userName}
                className="w-8 h-8 rounded-full object-cover border border-white/10"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center">
                <User size={16} className="text-white" />
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-red-500/10 transition-colors text-[#A1A1AA] hover:text-red-400"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <ChatSidebar
            conversations={conversations}
            activeId={activeConvId}
            onSelect={loadConversation}
            onNew={handleNewChat}
            onDelete={handleDeleteConversation}
            loading={loading}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {loading && !activeConvId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 && !sending ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <Bot size={48} className="mx-auto mb-6 text-primary-light/50" />
                <h2 className="text-xl font-display font-bold mb-3">
                  Bem-vindo ao{' '}
                  <span className="text-gradient-violet">Francos IA</span>
                </h2>
                <p className="text-[#A1A1AA] text-sm leading-relaxed mb-6">
                  Converse com inteligência artificial. Selecione um modelo, faça perguntas,
                  peça análises, gere conteúdo e muito mais.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {['Criar um texto', 'Analisar dados', 'Explicar conceito', 'Gerar código'].map(
                    (suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => handleSendMessage(suggestion)}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-[#A1A1AA] hover:text-white transition-colors border border-white/5"
                      >
                        {suggestion}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {/* ─── Banner de aviso de contexto ─── */}
              {contextWarning && (
                <div className="px-4 pt-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-amber-200 leading-relaxed">
                        {contextWarning}
                      </p>
                      <button
                        onClick={() => {
                          setContextWarning(null);
                          handleNewChat();
                        }}
                        className="mt-2 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2"
                      >
                        Criar Novo Chat
                      </button>
                    </div>
                    <button
                      onClick={() => setContextWarning(null)}
                      className="text-amber-400/50 hover:text-amber-300 transition-colors flex-shrink-0"
                      title="Fechar aviso"
                    >
                      <span className="text-lg leading-none">&times;</span>
                    </button>
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                // Resolve o nome amigável do modelo ANTES de renderizar
                // (evita qualquer processamento no ciclo de renderização do ChatMessage)
                const modelDisplayName = msg.model 
                  ? (models.find(m => m.id === msg.model)?.displayName || msg.model)
                  : undefined;
                return (
                  <ChatMessage
                    key={msg._id || msg._localId}
                    role={msg.role}
                    content={msg.content}
                    model={modelDisplayName}
                  />
                );
              })}
              {sending && (
                <div className="flex gap-4 px-6 py-6">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center">
                    <Bot size={18} className="text-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input */}
          <ChatInput onSend={handleSendMessage} disabled={sending} />
        </div>
      </div>
    </div>
  );
}
