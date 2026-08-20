// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../redux/store';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import SectionBackground from '../components/SectionBackground';
import { setCredentials } from '../redux/slices/authSlice';
import { apiBase } from '../lib/api';

const API_BASE = apiBase();

const OAuthSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Finalizando seu login...');

  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage('Autenticação com Google falhou. Tente novamente.');
      return;
    }

    if (!accessToken) {
      setStatus('error');
      setMessage('Token de acesso não encontrado. Tente fazer login novamente.');
      return;
    }

    // Decodifica o JWT do media-api para extrair dados do usuário
    let payload: any = null;
    try {
      const base64Url = accessToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      const binaryString = atob(base64 + padding);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      payload = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch {
      setStatus('error');
      setMessage('Token inválido. Tente fazer login novamente.');
      return;
    }

    localStorage.setItem('accessToken', accessToken);

    const navigateToDashboard = () => {
      setStatus('success');
      setMessage('Login realizado com sucesso! Redirecionando...');
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1500);
    };

    const handleSyncSuccess = (syncData: any) => {
      localStorage.setItem('accessToken', syncData.accessToken);
      localStorage.setItem('user', JSON.stringify(syncData.user));
      dispatch(setCredentials({ token: syncData.accessToken, user: syncData.user }));
      navigateToDashboard();
    };

    const handleSyncFallback = () => {
      setStatus('error');
      setMessage('Falha ao sincronizar com o servidor principal. Tente novamente ou faça login diretamente.');
    };

    // Sincroniza usuário com o servidor principal para ter token do chat
    fetch(`${API_BASE}/auth/google-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: payload.email,
        name: payload.username,
        photo: payload.photo,
        googleId: payload.googleId || payload._id,
      }),
    })
      .then((syncRes) => {
        if (!syncRes.ok) throw new Error(`Sync failed: ${syncRes.status}`);
        return syncRes.json();
      })
      .then((syncData) => {
        if (syncData && syncData.accessToken) {
          handleSyncSuccess(syncData);
        } else {
          handleSyncFallback();
        }
      })
      .catch(() => {
        handleSyncFallback();
      });
  }, [searchParams, navigate, dispatch]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 lg:px-[8%] pt-24"
      role="main"
      aria-label="Autenticação Google"
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
            <h1
              className={`font-display text-2xl font-bold mb-2 bg-clip-text text-transparent ${
                status === 'loading'
                  ? 'bg-gradient-to-r from-violet-400 to-pink-400'
                  : status === 'success'
                  ? 'bg-gradient-to-r from-emerald-400 to-green-400'
                  : 'bg-gradient-to-r from-red-400 to-rose-400'
              }`}
            >
              {status === 'loading'
                ? 'Autenticando...'
                : status === 'success'
                ? 'Login realizado!'
                : 'Falha na autenticação'}
            </h1>
          </div>

          {/* Message */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              status === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : status === 'error'
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-primary/10 border-primary/20'
            }`}
          >
            {status === 'loading' && (
              <Loader2 size={20} className="text-primary-light flex-shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
            )}
            <p
              className={`text-sm ${
                status === 'success'
                  ? 'text-emerald-300'
                  : status === 'error'
                  ? 'text-red-300'
                  : 'text-primary-light/80'
              }`}
            >
              {message}
            </p>
          </div>

          {/* Error action */}
          {status === 'error' && (
            <div className="mt-6 space-y-3">
              <button
                onClick={() => navigate('/login')}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium transition-all duration-300 shadow-lg shadow-primary/20"
              >
                Voltar para o login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OAuthSuccess;
