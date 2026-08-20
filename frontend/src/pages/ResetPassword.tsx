// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, ArrowRight, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import SectionBackground from '../components/SectionBackground';
import { authBase } from '../lib/api';

const API_URL = authBase();

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get('token') || '';

  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Token de recuperação não encontrado. Use o link do e-mail.');
      return;
    }

    if (!password || !confirmPassword) {
      setError('Preencha todos os campos.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
      setError('A senha deve conter letras maiúsculas, minúsculas e números.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Erro ao redefinir senha.');
      }

      setSuccess(true);

      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao conectar com o servidor.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 lg:px-[8%] pt-24" role="main" aria-label="Senha redefinida">
        <div className="absolute inset-0 overflow-hidden">
          <SectionBackground intensity="medium" gridSize="6rem" />
        </div>
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl p-8 border border-white/5 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <h1 className="font-display text-2xl font-bold text-white mb-3">
              Senha redefinida!
            </h1>
            <p className="text-[#A1A1AA] leading-relaxed mb-6">
              Sua senha foi alterada com sucesso. Você será redirecionado para o login em instantes.
            </p>
            <a
              href="/login"
              className="inline-flex items-center gap-2 text-primary-light hover:text-primary-light/80 transition-colors"
            >
              Ir para o login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 lg:px-[8%] pt-24"
      role="main"
      aria-label="Redefinir senha"
    >
      <div className="absolute inset-0 overflow-hidden">
        <SectionBackground intensity="medium" gridSize="6rem" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div
          className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl p-8 border border-white/5 shadow-2xl focus-within:border-primary/50 transition-all duration-300"
          role="form"
          aria-label="Formulário de redefinição de senha"
        >
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20"
              aria-hidden="true"
            >
              <Lock size={32} className="text-white" />
            </div>
            <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent mb-2">
              Redefinir senha
            </h1>
            <p className="text-[#A1A1AA] leading-relaxed">
              Escolha uma nova senha para sua conta.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Token (hidden if from URL) */}
            {!initialToken && (
              <div className="space-y-2">
                <label htmlFor="token-reset" className="block text-sm font-medium text-[#A1A1AA]">
                  Token de recuperação
                </label>
                <input
                  id="token-reset"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Cole o token do e-mail"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all font-mono text-sm"
                />
              </div>
            )}

            {/* New Password */}
            <div className="space-y-2">
              <label htmlFor="password-reset" className="block text-sm font-medium text-[#A1A1AA] flex justify-between items-center">
                <span>Nova senha</span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[#6B7280]/50 hover:text-white transition-colors"
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]/50" aria-hidden="true" />
                <input
                  id="password-reset"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  disabled={loading}
                  autoComplete="new-password"
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
              <p className="text-xs text-[#6B7280]/50 pl-1">
                Mínimo 8 caracteres com letras maiúsculas, minúsculas e números
              </p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label htmlFor="confirmPassword-reset" className="block text-sm font-medium text-[#A1A1AA] flex justify-between items-center">
                <span>Confirmar senha</span>
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-[#6B7280]/50 hover:text-white transition-colors"
                  aria-label={showConfirmPassword ? 'Esconder confirmação' : 'Mostrar confirmação'}
                >
                  {showConfirmPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]/50" aria-hidden="true" />
                <input
                  id="confirmPassword-reset"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  autoComplete="new-password"
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            {error && (
              <div
                className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-in fade-in duration-300"
                role="alert"
              >
                <AlertCircle size={18} className="text-red-400 flex-shrink-0" aria-hidden="true" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium transition-all duration-300 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Redefinindo...</span>
                </>
              ) : (
                <>
                  Redefinir senha
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[#A1A1AA] text-sm">
              Lembrou da senha?{' '}
              <a
                href="/login"
                className="font-medium text-primary-light hover:text-primary-light/80 transition-colors duration-300 underline-offset-4 hover:underline"
              >
                Fazer login
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
