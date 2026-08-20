// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Mail, Lock, AlertCircle, Eye, EyeOff, CheckCircle2, RefreshCw, Clock, ShieldCheck } from 'lucide-react';
import SectionBackground from '../components/SectionBackground';
import { authBase, domainBase } from '../lib/api';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showVerificationScreen, setShowVerificationScreen] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [smtpWarning, setSmtpWarning] = useState(false);

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

    // Validação frontend aprimorada para melhor UX
    if (!email || !password || !confirmPassword) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem. Por favor, verifique e tente novamente.');
      return;
    }

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    // Validação de força de senha básica
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    
    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
      setError('A senha deve conter letras maiúsculas, minúsculas e números.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      // ─── Passo A: Mensagem padrão amigável (fallback) ─────────
      let errorMessage = 'Não foi possível criar a conta. Tente novamente mais tarde.';
      let parsedData: Record<string, unknown> | null = null;

      // ─── Passo B: Só tenta parsear JSON se content-type for JSON ──
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          parsedData = await response.json();
        } catch {
          parsedData = null;
        }
      }

      // ─── Passo C: Tratamento específico: e-mail já cadastrado (409) ──
      if (response.status === 409) {
        errorMessage = 'Este e-mail já possui uma conta. Faça login para acessar.';
        setError(errorMessage);
        return;
      }

      // ─── Passo D: Se response não foi ok, usa mensagem do backend ou fallback ──
      if (!response.ok) {
        const errBody = parsedData?.error as { message?: string } | undefined;
        if (errBody?.message) {
          errorMessage = errBody.message;
        } else if (typeof parsedData?.message === 'string') {
          errorMessage = parsedData.message;
        }
        throw new Error(errorMessage);
      }

      setSuccess(true);
      
      // Notificação acessível para leitores de tela
      window.dispatchEvent(new CustomEvent('register-success', { detail: { user: parsedData?.user } }));
      
      // Verifica se o e-mail de verificação foi enviado
      // Se falso, exibe aviso de SMTP indisponível
      if (parsedData?.emailVerificationSent !== true) {
        setSmtpWarning(true);
      }

      // Mostra tela de verificação
      setShowVerificationScreen(true);
      startResendTimer();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Não foi possível criar a conta. Tente novamente mais tarde.';
      setError(errorMessage);

    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
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
        setResendMessage('E-mail reenviado! Verifique sua caixa de entrada.');
        setSmtpWarning(false);
        startResendTimer();
      } else {
        setResendMessage(data?.error?.message || 'Erro ao reenviar e-mail.');
      }
    } catch {
      setResendMessage('Erro ao conectar com o servidor. Tente novamente.');
    } finally {
      setResendingEmail(false);
    }
  };

  // ─── TELA DE VERIFICAÇÃO PÓS-REGISTRO ─────────────────────
  if (showVerificationScreen) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center px-6 lg:px-[8%] pt-24"
        role="main"
        aria-label="Confirmação de registro - verifique seu e-mail"
      >
        {/* Background */}
        <div className="absolute inset-0 overflow-hidden">
          <SectionBackground intensity="medium" gridSize="6rem" />
        </div>

        {/* Card de Verificação */}
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl p-8 border border-white/5 shadow-2xl transition-all duration-300">
            {/* SMTP Warning */}
            {smtpWarning && (
              <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 mb-6" role="alert">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-yellow-300 mb-1">
                      Não foi possível enviar o e-mail agora
                    </p>
                    <p className="text-xs text-yellow-300/70">
                      Tente novamente em instantes clicando no botão "Reenviar e-mail" abaixo.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Header */}
            <div className="text-center mb-8">
              <div 
                className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20"
                aria-hidden="true"
              >
                <CheckCircle2 size={32} className="text-white" />
              </div>
              <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent mb-2">
                Conta criada!
              </h1>
              <p className="text-[#A1A1AA] leading-relaxed">
                Falta só mais um passo para começar
              </p>
            </div>

            {/* Instructions */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <Mail size={20} className="text-primary-light flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-white mb-1">
                    Verifique seu e-mail
                  </p>
                  <p className="text-sm text-[#A1A1AA]">
                    Enviamos um link de confirmação para <strong className="text-white">{email}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <Clock size={20} className="text-primary-light flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-white mb-1">
                    Link válido por 24 horas
                  </p>
                  <p className="text-sm text-[#A1A1AA]">
                    Clique no link enviado para ativar sua conta. Se não encontrar, verifique a caixa de spam.
                  </p>
                </div>
              </div>
            </div>

            {/* Success / Error Messages */}
            {resendMessage && (
              <div 
                className={`p-4 rounded-xl border flex items-center gap-3 mb-6 ${
                  resendMessage.includes('Erro')
                    ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-emerald-500/10 border-emerald-500/20'
                }`}
                role="alert"
              >
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
                onClick={handleResendEmail}
                disabled={resendingEmail || resendTimer > 0}
                className="w-full py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-all duration-300 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
              >
                {resendingEmail ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Reenviando...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    <span>{resendTimer > 0 ? `Reenviar em ${resendTimer}s` : 'Reenviar e-mail'}</span>
                  </>
                )}
              </button>

              <button
                onClick={() => navigate('/login')}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium transition-all duration-300 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
              >
                <ShieldCheck size={18} />
                <span>Já verifiquei meu e-mail</span>
                <ArrowRight size={18} />
              </button>
            </div>

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-xs text-[#A1A1AA]/50">
                Não recebeu o e-mail? Verifique a caixa de spam ou clique em "Reenviar e-mail" acima.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── FORMULÁRIO DE REGISTRO ────────────────────────────────
  return (
    <div 
      className="min-h-screen flex items-center justify-center px-6 lg:px-[8%] pt-24"
      role="main"
      aria-label="Página de registro da Francos Corp"
    >
      {/* Background compartilhado */}
      <div className="absolute inset-0 overflow-hidden">
        <SectionBackground intensity="medium" gridSize="6rem" />
      </div>

      {/* Card de Registro */}
      <div className="relative z-10 w-full max-w-md">
        <div 
          className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl p-8 border border-white/5 shadow-2xl focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-300"
          role="form"
          aria-label="Formulário de registro"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div 
              className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20"
              aria-hidden="true"
            >
              <Mail size={32} className="text-white" />
            </div>
            <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent mb-2">
              Crie sua conta
            </h1>
            <p className="text-[#A1A1AA] leading-relaxed">
              Junte-se à Francos Corp e comece a explorar o poder da IA generativa
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email Input - Acessível com ARIA */}
            <div className="space-y-2">
              <label 
                htmlFor="email-register" 
                className="block text-sm font-medium text-[#A1A1AA] focus-visible:outline-none"
              >
                E-mail
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]/50" aria-hidden="true" />
                <input
                  id="email-register"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  disabled={loading || success}
                  autoComplete="email"
                  aria-label="Endereço de e-mail para criar conta"
                  aria-describedby="email-error"
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            {/* Password Input - Com toggle de visibilidade e bloqueio de colar */}
            <div className="space-y-2">
              <label
                htmlFor="password-register"
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
                  id="password-register"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  disabled={loading || success}
                  autoComplete="new-password"
                  aria-label="Senha para sua nova conta (mínimo 8 caracteres)"
                  aria-describedby="password-error password-hint"
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
              
              {/* Dica de senha */}
              <p id="password-hint" className="text-xs text-[#6B7280]/50 pl-1">
                Mínimo 8 caracteres com letras maiúsculas, minúsculas e números
              </p>
            </div>

            {/* Confirm Password Input - Com toggle de visibilidade e bloqueio de colar */}
            <div className="space-y-2">
              <label
                htmlFor="confirmPassword-register"
                className="block text-sm font-medium text-[#A1A1AA] focus-visible:outline-none flex justify-between items-center"
              >
                <span>Confirmar Senha</span>
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-[#6B7280]/50 hover:text-white transition-colors duration-300 focus-visible:outline-none focus-visible:text-primary-light"
                  aria-label={showConfirmPassword ? 'Esconder confirmação de senha' : 'Mostrar confirmação de senha'}
                >
                  {showConfirmPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]/50" aria-hidden="true" />
                <input
                  id="confirmPassword-register"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  placeholder="••••••••"
                  required
                  disabled={loading || success}
                  autoComplete="new-password"
                  aria-label="Confirme sua senha digitando novamente"
                  aria-describedby="confirm-error"
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            {/* Error Message - Acessível para leitores de tela */}
            {error && (
              <div 
                id="email-error"
                className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-in fade-in slide-in-from-top-2 duration-300"
                role="alert"
              >
                <AlertCircle size={18} className="text-red-400 flex-shrink-0" aria-hidden="true" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Password Error Message */}
            {password && error?.includes('senha') && (
              <div 
                id="confirm-error"
                className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-in fade-in slide-in-from-top-2 duration-300"
                role="alert"
              >
                <AlertCircle size={18} className="text-red-400 flex-shrink-0" aria-hidden="true" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || success}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium transition-all duration-300 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Criando conta...</span>
                </>
              ) : (
                <>
                  Criar minha conta
                  <ArrowRight size={18} />
                </>
              )}
            </button>

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
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-[#A1A1AA] text-sm">
              Já tem uma conta?{' '}
                <a 
                  href="/login"
                  className="font-medium text-primary-light hover:text-primary-light/80 transition-colors duration-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  Fazer login
                </a>
            </p>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-6 text-center">
          <p className="text-[#A1A1AA]/50 text-xs">
            Ao criar uma conta, você concorda com nossos{' '}
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

export default Register;
