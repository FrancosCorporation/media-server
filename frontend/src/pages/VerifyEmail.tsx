// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle2, XCircle, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import SectionBackground from '../components/SectionBackground';
import { authBase } from '../lib/api';

const API_URL = authBase();

const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verificando seu e-mail...');

  useEffect(() => {
    if (!token || !email) {
      setStatus('error');
      setMessage('Link de verificação inválido. Certifique-se de usar o link completo enviado para seu e-mail.');
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await fetch(`${API_URL}/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        const data = await response.json();

        if (response.ok) {
          setStatus('success');
          setMessage(data?.message || 'E-mail verificado com sucesso!');
        } else {
          setStatus('error');
          setMessage(data?.error?.message || 'Link de verificação inválido ou expirado.');
        }
      } catch {
        setStatus('error');
        setMessage('Erro ao conectar com o servidor. Tente novamente mais tarde.');
      }
    };

    verifyEmail();
  }, [token, email]);

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-6 lg:px-[8%] pt-24"
      role="main"
      aria-label="Página de verificação de e-mail"
    >
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <SectionBackground intensity="medium" gridSize="6rem" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl p-8 border border-white/5 shadow-2xl transition-all duration-300">
          {/* Header */}
          <div className="text-center mb-8">
            <div 
              className={`w-16 h-16 rounded-xl mx-auto mb-4 shadow-lg flex items-center justify-center ${
                status === 'loading'
                  ? 'bg-gradient-to-br from-primary to-indigo-600 shadow-primary/20'
                  : status === 'success'
                  ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20'
                  : 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/20'
              }`}
              aria-hidden="true"
            >
              {status === 'loading' ? (
                <Loader2 size={32} className="text-white animate-spin" />
              ) : status === 'success' ? (
                <CheckCircle2 size={32} className="text-white" />
              ) : (
                <XCircle size={32} className="text-white" />
              )}
            </div>
            <h1 className={`font-display text-3xl font-bold mb-2 bg-clip-text text-transparent ${
              status === 'loading'
                ? 'bg-gradient-to-r from-violet-400 to-pink-400'
                : status === 'success'
                ? 'bg-gradient-to-r from-emerald-400 to-green-400'
                : 'bg-gradient-to-r from-red-400 to-rose-400'
            }`}>
              {status === 'loading' ? 'Verificando...' : status === 'success' ? 'E-mail Verificado!' : 'Falha na Verificação'}
            </h1>
            <p className="text-[#A1A1AA] leading-relaxed">
              {status === 'loading' ? 'Aguarde enquanto confirmamos seu e-mail...' : ''}
            </p>
          </div>

          {/* Message */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            status === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : status === 'error'
              ? 'bg-red-500/10 border-red-500/20'
              : 'bg-primary/10 border-primary/20'
          }`}>
            {status === 'error' && (
              <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            )}
            {status === 'success' && (
              <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            )}
            {status === 'loading' && (
              <Loader2 size={20} className="text-primary-light flex-shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
            )}
            <p className={`text-sm ${
              status === 'success' ? 'text-emerald-300' : status === 'error' ? 'text-red-300' : 'text-primary-light/80'
            }`}>
              {message}
            </p>
          </div>

          {/* Buttons */}
          <div className="mt-6 space-y-3">
            {status === 'success' && (
              <button
                onClick={() => navigate('/login')}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium transition-all duration-300 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
              >
                Fazer login
                <ArrowRight size={18} />
              </button>
            )}

            {status === 'error' && (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium transition-all duration-300 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
                >
                  Ir para o login
                  <ArrowRight size={18} />
                </button>
                <p className="text-center text-sm text-[#A1A1AA]">
                  <span className="text-primary-light hover:text-primary-light/80 cursor-pointer transition-colors"
                    onClick={() => {
                      if (email) {
                        navigate(`/login?email=${encodeURIComponent(email)}`);
                      } else {
                        navigate('/login');
                      }
                    }}
                  >
                    Solicitar novo link de verificação
                  </span>
                </p>
              </>
            )}

            {status === 'loading' && (
              <p className="text-center text-sm text-[#A1A1AA]">
                Isso pode levar alguns segundos...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
