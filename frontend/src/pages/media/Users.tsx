// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState, useCallback } from 'react';
import MediaLayout from '@/components/media/MediaLayout';
import { mediaApi } from '@/services/media/api';
import type { MediaUser } from '@/types/media';
import { Users as UsersIcon, Plus, Trash2, Shield, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { useMediaToast } from '@/components/media/MediaToast';

export default function MediaUsers() {
  const { t } = useI18n();
  const toast = useMediaToast();
  const [users, setUsers] = useState<MediaUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [error, setError] = useState('');

  useEffect(() => {
    mediaApi.getUsers()
      .then((data) => setUsers(data.users || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !password) return;
    setError('');
    try {
      const data = await mediaApi.createUser({ username, email, password, role });
      setUsers((prev) => [...prev, data.user]);
      setShowForm(false);
      setUsername('');
      setEmail('');
      setPassword('');
      setRole('user');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('users.errorCreating'));
    }
  }, [username, email, password, role, t]);

  const handleDelete = async (id: string) => {
    if (!confirm(t('users.deleteConfirm'))) return;
    try {
      await mediaApi.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u._id !== id));
    } catch (err: unknown) {
      toast.error(t('users.errorDeleting'), err instanceof Error ? err.message : undefined);
    }
  };

  const currentUser = localStorage.getItem('media_user');
  const currentUserId = currentUser ? JSON.parse(currentUser)._id : null;

  return (
    <MediaLayout>
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{t('users.title')}</h1>
            <p className="text-gray-400 text-sm mt-1">{t('users.subtitle')}</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" /> {t('users.newUser')}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-4">
            <h3 className="text-lg font-semibold text-white">{t('users.createUser')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('users.username')} className="px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-gray-500 outline-none focus:border-sky-500/50 text-sm" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('users.email')} type="email" className="px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-gray-500 outline-none focus:border-sky-500/50 text-sm" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('users.password')} type="password" className="px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-gray-500 outline-none focus:border-sky-500/50 text-sm" />
              <select value={role} onChange={(e) => setRole(e.target.value as any)} className="px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white outline-none focus:border-sky-500/50 text-sm">
                <option value="user">{t('users.roleUser')}</option>
                <option value="admin">{t('users.roleAdmin')}</option>
              </select>
            </div>
            {error && <p className="text-sm text-sky-400">{error}</p>}
            <button type="submit" className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium">{t('users.create')}</button>
          </form>
        )}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!loading && (
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u._id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    u.role === 'admin' ? 'bg-sky-500/10 text-sky-400' : 'bg-blue-500/10 text-blue-400'
                  )}>
                    {u.role === 'admin' ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{u.username}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    u.role === 'admin' ? 'bg-sky-500/10 text-sky-400' : 'bg-blue-500/10 text-blue-400'
                  )}>
                    {u.role === 'admin' ? t('users.roleAdmin') : t('users.roleUser')}
                  </span>
                  {u._id !== currentUserId && (
                    <button onClick={() => handleDelete(u._id)} className="p-2 rounded-lg text-gray-500 hover:text-sky-400 hover:bg-sky-500/10 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <div className="text-center py-16">
                <UsersIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">{t('users.noUsers')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </MediaLayout>
  );
}
