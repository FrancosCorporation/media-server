// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mediaApi } from '@/services/media/api';
import { Film, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

export default function MediaLogin() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError('');
    try {
      const data = await mediaApi.login(username, password);
      localStorage.setItem('media_token', data.token);
      localStorage.setItem('media_user', JSON.stringify(data.user));
      navigate('/dolfimflix');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-600/20 border border-sky-600/30 mb-4">
              <Film className="w-8 h-8 text-sky-500" />
            </div>
            <h1 className="text-3xl font-bold text-white">DolfimFlix</h1>
            <p className="text-gray-400 text-sm mt-1">{t('login.loginToContinue')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
<div>
             <input
               type="text"
               value={username}
               onChange={(e) => setUsername(e.target.value)}
               placeholder={t('login.username')}
               className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-gray-500 outline-none focus:border-sky-500/50 transition-all text-sm"
               autoFocus
               autoComplete="username"
             />
           </div>
           <div className="relative">
             <input
               type={showPass ? 'text' : 'password'}
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               autoComplete="current-password"
               placeholder={t('login.password')}
              className="w-full px-4 py-3 pr-10 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-gray-500 outline-none focus:border-sky-500/50 transition-all text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className={cn(
              'w-full py-3 rounded-xl text-sm font-semibold transition-all',
              'bg-sky-600 hover:bg-sky-700 text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {loading ? t('login.loggingIn') : t('login.login')}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 mt-6">
          {t('login.footer')}
        </p>
      </div>
    </div>
  );
}
