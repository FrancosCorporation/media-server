// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Loader2, Mic, MicOff, AlertTriangle, X } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

// ─── Escopo global: detecta se está em HTTP (não localhost) ───
const isInsecureContext = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'http:' &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1')
  );
};

// ─── Detecta se o navegador suporta MediaRecorder ─────────────
const isMediaRecorderSupported = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
};

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micWarning, setMicWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Guarda se já mostrou o aviso de permissão negada para não repetir
  const permissionDeniedRef = useRef(false);

  // ─── Verificação preventiva no mount: HTTPS? ────────────────
  const [isInsecureContextState] = useState(() => isInsecureContext());

  // ─── Ajuste automático de altura da textarea ───────────────
  const adjustHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  // ─── Auto-ocultar aviso após 10 segundos ───────────────
  useEffect(() => {
    if (!micWarning) return;
    const timer = setTimeout(() => setMicWarning(null), 10000);
    return () => clearTimeout(timer);
  }, [micWarning]);

  // ─── Cleanup na desmontagem ────────────────────────────
  useEffect(() => {
    return () => {
      // Para gravação e libera stream se ainda ativo
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // ─── Envia o áudio para o backend transcrever ──────────────
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    setIsTranscribing(true);

    // Determina o MIME type (fallback para webm)
    const mimeType = audioBlob.type || 'audio/webm';

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, `audio.${mimeType.includes('ogg') ? 'ogg' : 'webm'}`);

      // Inclui o token de autenticação (a rota é protegida)
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.text || null;
    } catch (err: any) {


      if (err.message?.includes('503') || err.message?.includes('indisponível')) {
        setMicWarning('Serviço de transcrição temporariamente indisponível. Tente novamente mais tarde.');
      } else {
        setMicWarning('Erro ao transcrever o áudio. Verifique sua conexão e tente novamente.');
      }
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  // ─── Finaliza a gravação e envia para transcrição ──────────
  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      setIsListening(false);
      return;
    }

    // Para o MediaRecorder — o evento onstop será disparado
    mediaRecorderRef.current.stop();

    // Para todas as tracks do stream de áudio
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // ─── Inicia a gravação de áudio via MediaRecorder ──────────
  const startRecording = useCallback(async () => {
    // Reseta o flag de permissão negada
    permissionDeniedRef.current = false;

    // Verifica suporte
    if (!isMediaRecorderSupported()) {
      setMicWarning('Seu navegador não suporta gravação de áudio. Tente Chrome, Edge ou Firefox.');
      return;
    }

    try {
      // Pede permissão do microfone (pop-up padrão do navegador)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Determina o formato de áudio suportado
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/wav',
      ];
      const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';

      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);

        // Junta os chunks em um único Blob
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (audioBlob.size === 0) {
          return;
        }

        // Envia para transcrição
        const text = await transcribeAudio(audioBlob);
        if (text) {
          setInput((prev) => {
            const base = prev.trim();
            return base ? `${base} ${text}` : text;
          });
        }
      };

      mediaRecorder.onerror = () => {
        setIsListening(false);
        setMicWarning('Erro ao gravar áudio. Tente novamente.');
      };

      // Inicia a gravação
      mediaRecorder.start();
      setIsListening(true);
    } catch (err: any) {


      // Erro de permissão negada
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        if (!permissionDeniedRef.current) {
          permissionDeniedRef.current = true;
          setMicWarning(
            'Permissão do microfone negada. Permita o acesso ao microfone nas configurações do navegador e tente novamente.'
          );
        }
      } else if (err.name === 'NotFoundError') {
        setMicWarning('Nenhum microfone encontrado. Conecte um microfone e tente novamente.');
      } else {
        setMicWarning('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
      }
    }
  }, [transcribeAudio]);

  // ─── Handler do botão do microfone ────────────────────────
  const handleMicClick = useCallback(() => {
    if (isTranscribing) return; // Ignora cliques enquanto transcreve

    if (isListening) {
      // Já está gravando → para
      stopRecording();
    } else {
      // Não está gravando → inicia
      startRecording();
    }
  }, [isListening, isTranscribing, startRecording, stopRecording]);

  // ─── Envio da mensagem ─────────────────────────────────────
  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || disabled) return;
    onSend(text);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [input, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Determina o label do botão
  const getMicButtonClass = () => {
    if (isListening) return 'bg-red-500/20 text-red-400 animate-pulse shadow-lg shadow-red-500/20';
    if (isTranscribing) return 'bg-primary/20 text-primary-light';
    if (isInsecureContextState) return 'text-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10';
    return 'text-[#6B7280] hover:text-white hover:bg-white/5';
  };

  const getMicTitle = () => {
    if (isTranscribing) return 'Transcrevendo áudio...';
    if (isInsecureContextState) return 'Indisponível: reconhecimento de voz requer HTTPS';
    if (isListening) return 'Clique para parar a gravação';
    return 'Gravar áudio';
  };

  const getMicIcon = () => {
    if (isTranscribing) return <Loader2 size={18} className="animate-spin" />;
    if (isListening) return <MicOff size={18} />;
    return <Mic size={18} />;
  };

  return (
    <div className="border-t border-white/5 bg-[#0F172A]/95 backdrop-blur-sm shrink-0">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 sm:py-4">

        {/* ─── Banner de aviso do microfone ─── */}
        {micWarning && (
          <div className="mb-3 animate-in slide-in-from-bottom-2 fade-in duration-300">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 shadow-lg shadow-amber-500/5">
              <div className="flex-shrink-0 mt-0.5">
                <AlertTriangle size={18} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-amber-200/90 leading-relaxed whitespace-pre-line">
                  {micWarning}
                </p>
              </div>
              <button
                onClick={() => setMicWarning(null)}
                className="flex-shrink-0 p-1 rounded-lg text-amber-400/50 hover:text-amber-300 hover:bg-amber-500/10 transition-all duration-200"
                title="Fechar aviso"
                aria-label="Fechar aviso"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Container principal ─── */}
        <div className="flex items-center gap-2 bg-[#0D1117] rounded-2xl border border-white/10 focus-within:border-primary/50 transition-colors px-4 py-2.5">
          
          {/* ─── Botão Microfone ─── */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={disabled || isTranscribing}
            className={`flex-shrink-0 p-2 rounded-lg transition-all duration-200 ${getMicButtonClass()} disabled:opacity-30`}
            title={getMicTitle()}
            aria-label={isListening ? 'Parar gravação de voz' : 'Iniciar gravação de voz'}
          >
            {getMicIcon()}
          </button>

          {/* ─── Textarea ─── */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            rows={1}
            disabled={disabled}
            className="flex-1 bg-transparent text-white placeholder:text-[#6B7280]/50 outline-none resize-none max-h-[200px] text-sm leading-relaxed py-0.5 align-middle self-center"
          />

          {/* ─── Botão Enviar ─── */}
          <button
            onClick={handleSubmit}
            disabled={disabled || !input.trim()}
            className="flex-shrink-0 p-2.5 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-primary/20 active:scale-95"
            aria-label="Enviar mensagem"
          >
            {disabled ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>

        {/* ─── Indicador de gravação ─── */}
        {isListening && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-red-400 animate-pulse">
              Gravando... clique no microfone para parar
            </span>
            <button
              onClick={handleMicClick}
              className="text-xs text-[#6B7280] hover:text-white transition-colors underline ml-2"
            >
              Parar
            </button>
          </div>
        )}

        {/* ─── Indicador de transcrição ─── */}
        {isTranscribing && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <Loader2 size={14} className="text-primary-light animate-spin" />
            <span className="text-xs text-primary-light">
              Transcrevendo áudio...
            </span>
          </div>
        )}

        <p className="text-xs text-[#6B7280] text-center mt-2">
          A IA pode cometer erros. Verifique informações importantes.
        </p>
      </div>
    </div>
  );
}
