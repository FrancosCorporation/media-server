// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Mail, Lock, AlertCircle, Eye, EyeOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import SectionBackground from '../components/SectionBackground';
import { authBase, domainBase } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  // URL da API definida via .env (VITE_API_URL)
  const API_URL = authBase();

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setNeedsEmailVerification(false);
    setResendMessage(null);

    // Se já está no modo de verificação, ignora submit
    if (needsEmailVerification) {
      return;
    }

    // Validação frontend adicional para melhor UX
    if (!email || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    try {
      setLoading(true);
      
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      // ─── Passo A: Mensagem padrão amigável (fallback) ─────────
      let errorMessage = 'Não foi possível fazer login. Tente novamente mais tarde.';
      let data: Record<string, unknown> | null = null;

      // ─── Passo B: Só tenta parsear JSON se content-type for JSON ──
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      }

      // ─── Tratamento específico: e-mail não verificado ───────
      const errBody = data?.error as { message?: string } | undefined;
      if (response.status === 403 && errBody?.message?.includes('não foi verificada')) {
        setNeedsEmailVerification(true);
        setError(errBody.message);
        return;
      }

      if (!response.ok) {
        // Extrai mensagem do backend se disponível
        if (errBody?.message) {
          errorMessage = errBody.message;
        } else if (typeof data?.message === 'string') {
          errorMessage = data.message;
        }
        throw new Error(errorMessage);
      }

      setSuccess(true);
      
      // Salva token e dados do usuário no localStorage
      const savedToken = (data?.accessToken || data?.token) as string;
      if (savedToken) {
        localStorage.setItem('accessToken', savedToken);
        localStorage.setItem('media_token', savedToken);
      }
      
      // Tenta recuperar informações do usuário usando o token
      if (savedToken) {
        try {
          const userResponse = await fetch(`${API_URL}/me`, {
            headers: {
              'Authorization': `Bearer ${savedToken}`
            },
            credentials: 'include',
          });
          
          // ─── Blindagem também para /me ───────────────────
          const meContentType = userResponse.headers.get('content-type');
          if (userResponse.ok && meContentType && meContentType.includes('application/json')) {
            const userData = await userResponse.json();
            localStorage.setItem('user', JSON.stringify(userData));
          } else if (userResponse.status === 401) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            setSuccess(false);
            setError(null);
          } else {
            localStorage.setItem('user', JSON.stringify({ email: data?.email || email }));
          }
        } catch {
          localStorage.setItem('user', JSON.stringify({ email: data?.email || email }));
        }
      }

      // Redireciona para o dashboard após sucesso
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Não foi possível fazer login. Tente novamente mais tarde.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendTimer > 0) return;

    setResendingEmail(true);
    setResendMessage(null);

    try {
      const response = await fetch(`${API_URL}/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setResendMessage('Link de verificação reenviado! Verifique sua caixa de entrada.');
        startResendTimer();
      } else {
        setResendMessage(data?.error?.message || 'Erro ao reenviar link.');
      }
    } catch {
      setResendMessage('Erro ao conectar com o servidor. Tente novamente.');
    } finally {
      setResendingEmail(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-6 lg:px-[8%] pt-24"
      role="main"
      aria-label="Página de login da Francos Corp"
    >
      {/* Background compartilhado */}
      <div className="absolute inset-0 overflow-hidden">
        <SectionBackground intensity="medium" gridSize="6rem" />
      </div>

      {/* Card de Login */}
      <div className="relative z-10 w-full max-w-md">
        <div 
          className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl p-8 border border-white/5 shadow-2xl focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-300"
          role="form"
          aria-label="Formulário de login"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div 
              className={`w-16 h-16 rounded-xl mx-auto mb-4 shadow-lg flex items-center justify-center ${
                needsEmailVerification
                  ? 'bg-gradient-to-br from-yellow-500 to-orange-600 shadow-yellow-500/20'
                  : 'bg-gradient-to-br from-primary to-indigo-600 shadow-primary/20'
              }`}
              aria-hidden="true"
            >
              <Mail size={32} className="text-white" />
            </div>
            <h1 className={`font-display text-3xl font-bold mb-2 bg-clip-text text-transparent ${
              needsEmailVerification
                ? 'bg-gradient-to-r from-yellow-400 to-orange-400'
                : 'bg-gradient-to-r from-violet-400 to-pink-400'
            }`}>
              {needsEmailVerification ? 'E-mail não verificado' : 'Bem-vindo de volta!'}
            </h1>
            <p className="text-[#A1A1AA] leading-relaxed">
              {needsEmailVerification
                ? 'Você precisa verificar seu e-mail antes de acessar sua conta.'
                : 'Entre na sua conta para acessar todas as funcionalidades da Francos Corp'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email Input - Acessível com ARIA e foco visível */}
            <div className="space-y-2">
              <label 
                htmlFor="email-login" 
                className="block text-sm font-medium text-[#A1A1AA] focus-visible:outline-none"
              >
                E-mail
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]/50" aria-hidden="true" />
                <input
                  id="email-login"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setNeedsEmailVerification(false);
                  }}
                  placeholder="seu@email.com"
                  required
                  disabled={loading || success}
                  autoComplete="email"
                  aria-label="Endereço de e-mail para login"
                  aria-describedby="email-error"
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            {/* Password Input - Com toggle de visibilidade e bloqueio de colar */}
            <div className="space-y-2">
              <label
                htmlFor="password-login"
                className="block text-sm font-medium text-[#A1A1AA] focus-visible:outline-none flex justify-between items-center"
              >
                <span>Senha</span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[#6B7280]/50 hover:text-white transition-colors duration-300 focus-visible:outline-none focus-visible:text-primary-light"
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]/50" aria-hidden="true" />
                <input
                  id="password-login"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  placeholder="••••••••"
                  required
                  disabled={loading || success}
                  autoComplete="current-password"
                  aria-label="Senha para login na conta"
                  aria-describedby="email-error"
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            {/* ─── Mensagens ────────────────────────────────────── */}

            {/* Error Message */}
            {error && !needsEmailVerification && (
              <div 
                id="email-error"
                className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-in fade-in slide-in-from-top-2 duration-300"
                role="alert"
              >
                <AlertCircle size={18} className="text-red-400 flex-shrink-0" aria-hidden="true" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Email not verified message with resend */}
            {needsEmailVerification && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div 
                  className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20"
                  role="alert"
                >
                  <p className="text-sm text-yellow-300 leading-relaxed">
                    {error}
                  </p>
                </div>

                {/* Resend success message */}
                {resendMessage && (
                  <div 
                    className={`p-3 rounded-xl border flex items-center gap-2 ${
                      resendMessage.includes('Erro')
                        ? 'bg-red-500/10 border-red-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/20'
                    }`}
                    role="alert"
                  >
                    {resendMessage.includes('Erro') ? (
                      <AlertCircle size={16} className="text-red-400 flex-shrink-0" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" aria-hidden="true" />
                    )}
                    <p className={`text-xs ${resendMessage.includes('Erro') ? 'text-red-300' : 'text-emerald-300'}`}>
                      {resendMessage}
                    </p>
                  </div>
                )}

                {/* Resend button */}
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendingEmail || resendTimer > 0}
                  className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-all duration-300 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {resendingEmail ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Reenviando...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      <span>{resendTimer > 0 ? `Reenviar em ${resendTimer}s` : 'Reenviar link de verificação'}</span>
                    </>
                  )}
                </button>

                <p className="text-xs text-[#A1A1AA]/50 text-center">
                  Não recebeu o e-mail? Verifique a caixa de spam ou clique acima para reenviar.
                </p>
              </div>
            )}

            {/* Submit Button (dentro do form para funcionar com Enter) */}
            {!needsEmailVerification && (
              <>
                <button
                  type="submit"
                  disabled={loading || success}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium transition-all duration-300 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
                  aria-busy={loading}
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Entrando...</span>
                    </>
                  ) : (
                    <>
                      Entrar na conta
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>

                {/* Forgot password link */}
                <div className="flex justify-end items-center text-sm">
                  <a 
                    href="/forgot-password"
                    className="text-[#A1A1AA] hover:text-white transition-colors duration-300 focus-visible:outline-none focus-visible:underline"
                  >
                    Esqueceu a senha?
                  </a>
                </div>

                {/* Divider */}
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/5" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-[#0F172A]/50 px-3 text-[#6B7280]">ou continue com</span>
                  </div>
                </div>

                {/* Google Button */}
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `${domainBase()}/api/auth/google`;
                  }}
                  className="w-full py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-all duration-300 border border-white/10 flex items-center justify-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" className="flex-shrink-0">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Continuar com Google</span>
                </button>
              </>
            )}
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-[#A1A1AA] text-sm">
              Não tem uma conta?{' '}
                <a 
                  href="/register"
                  className="font-medium text-primary-light hover:text-primary-light/80 transition-colors duration-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  Criar conta gratuita
                </a>
            </p>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-6 text-center">
          <p className="text-[#A1A1AA]/50 text-xs">
            Ao entrar, você concorda com nossos{' '}
              <a href="#" className="underline decoration-dotted hover:text-white transition-colors duration-300 focus-visible:outline-none focus-visible:underline">
                Termos de Uso
              </a>{' '}
              e{' '}
              <a href="#" className="underline decoration-dotted hover:text-white transition-colors duration-300 focus-visible:outline-none focus-visible:underline">
                Política de Privacidade
              </a>
          </p>
        </div>
      </div>
    </div>
  );
};


