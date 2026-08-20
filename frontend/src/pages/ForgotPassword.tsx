// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import SectionBackground from '../components/SectionBackground';
import { authBase } from '../lib/api';

const API_URL = authBase();

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('Por favor, informe seu e-mail.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Erro ao solicitar recuperação.');
      }

      setSent(true);
      
      // Em desenvolvimento, mostra o token de debug

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao conectar com o servidor.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 lg:px-[8%] pt-24" role="main" aria-label="E-mail enviado">
        <div className="absolute inset-0 overflow-hidden">
          <SectionBackground intensity="medium" gridSize="6rem" />
        </div>
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl p-8 border border-white/5 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <h1 className="font-display text-2xl font-bold text-white mb-3">
              E-mail enviado!
            </h1>
            <p className="text-[#A1A1AA] leading-relaxed mb-6">
              Se o e-mail <strong className="text-white">{email}</strong> estiver cadastrado, 
              você receberá um link para redefinir sua senha em alguns minutos.
            </p>
            <p className="text-[#6B7280] text-sm">
              Não recebeu? Verifique sua caixa de spam ou{' '}
              <button
                onClick={() => { setSent(false); setError(null); }}
                className="text-primary-light hover:text-primary-light/80 transition-colors underline"
              >
                tente novamente
              </button>
            </p>
            <a
              href="/login"
              className="inline-flex items-center gap-2 mt-6 text-[#A1A1AA] hover:text-white transition-colors text-sm"
            >
              Voltar para o login
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
      aria-label="Recuperar senha"
    >
      <div className="absolute inset-0 overflow-hidden">
        <SectionBackground intensity="medium" gridSize="6rem" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div
          className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl p-8 border border-white/5 shadow-2xl focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-300"
          role="form"
          aria-label="Formulário de recuperação de senha"
        >
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20"
              aria-hidden="true"
            >
              <Mail size={32} className="text-white" />
            </div>
            <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent mb-2">
              Recuperar senha
            </h1>
            <p className="text-[#A1A1AA] leading-relaxed">
              Digite o e-mail da sua conta e enviaremos um link para redefinir sua senha.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <label htmlFor="email-forgot" className="block text-sm font-medium text-[#A1A1AA]">
                E-mail
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]/50" aria-hidden="true" />
                <input
                  id="email-forgot"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                  aria-label="E-mail da sua conta"
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all duration-300 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            {error && (
              <div
                className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-in fade-in slide-in-from-top-2 duration-300"
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
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  Enviar link de recuperação
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

export default ForgotPassword;
