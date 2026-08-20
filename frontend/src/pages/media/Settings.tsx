// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState } from 'react';
import MediaLayout from '@/components/media/MediaLayout';
import { mediaApi } from '@/services/media/api';
import type { MediaSettings } from '@/types/media';
import { Save, Loader2, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n, type Locale } from '@/i18n';
import { useMediaToast } from '@/components/media/MediaToast';
import { Skeleton } from '@/components/ui/skeleton';

const defaultSettings: MediaSettings = {
  radarrUrl: '',
  radarrApiKey: '',
  sonarrUrl: '',
  sonarrApiKey: '',
  prowlarrUrl: '',
  prowlarrApiKey: '',
  qbittorrentUrl: '',
  qbittorrentUsername: '',
  qbittorrentPassword: '',
  jellyfinUrl: '',
  jellyfinApiKey: '',
  defaultQuality: '1080p',
  preferHevc: true,
  preferLanguage: 'pt',
  fallbackLanguage: 'en',
  uiLanguage: 'pt-BR',
};

export default function MediaSettings() {
  const { t, locale, setLocale } = useI18n();
  const toast = useMediaToast();
  const [settings, setSettings] = useState<MediaSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mediaApi.getSettings()
      .then((data) => {
        const merged = { ...defaultSettings, ...data.settings };
        try {
          const local = JSON.parse(localStorage.getItem('media_settings') || '{}');
          if (local.uiLanguage) merged.uiLanguage = local.uiLanguage;
        } catch {}
        setSettings(merged);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mediaApi.updateSettings(settings);
      try {
        const s = JSON.parse(localStorage.getItem('media_settings') || '{}');
        s.uiLanguage = settings.uiLanguage;
        localStorage.setItem('media_settings', JSON.stringify(s));
      } catch {}
      toast.success(t('settings.saved'));
    } catch (err: unknown) {
      toast.error(t('settings.saveError'), err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof MediaSettings, value: any) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <MediaLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            ))}
          </div>
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </MediaLayout>
    );
  }

  return (
    <MediaLayout>
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">{t('settings.title')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('settings.subtitle')}</p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">{t('settings.radarr')}</h2>
          <Input label="URL" value={settings.radarrUrl || ''} onChange={(v) => set('radarrUrl', v)} placeholder="http://radarr:7878" />
          <Input label="API Key" value={settings.radarrApiKey || ''} onChange={(v) => set('radarrApiKey', v)} type="password" />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">{t('settings.sonarr')}</h2>
          <Input label="URL" value={settings.sonarrUrl || ''} onChange={(v) => set('sonarrUrl', v)} placeholder="http://sonarr:8989" />
          <Input label="API Key" value={settings.sonarrApiKey || ''} onChange={(v) => set('sonarrApiKey', v)} type="password" />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">{t('settings.prowlarr')}</h2>
          <Input label="URL" value={settings.prowlarrUrl || ''} onChange={(v) => set('prowlarrUrl', v)} placeholder="http://prowlarr:9696" />
          <Input label="API Key" value={settings.prowlarrApiKey || ''} onChange={(v) => set('prowlarrApiKey', v)} type="password" />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            {t('settings.qbittorrent')}
            <QbStatus />
          </h2>
          <Input label="URL" value={settings.qbittorrentUrl || ''} onChange={(v) => set('qbittorrentUrl', v)} placeholder="http://qbittorrent:8080" />
          <Input label={t('users.username')} value={settings.qbittorrentUsername || ''} onChange={(v) => set('qbittorrentUsername', v)} />
          <Input label={t('users.password')} value={settings.qbittorrentPassword || ''} onChange={(v) => set('qbittorrentPassword', v)} type="password" />
          <QbTestButton />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">{t('settings.jellyfin')}</h2>
          <Input label="URL" value={settings.jellyfinUrl || ''} onChange={(v) => set('jellyfinUrl', v)} placeholder="http://jellyfin:8096" />
          <Input label="API Key" value={settings.jellyfinApiKey || ''} onChange={(v) => set('jellyfinApiKey', v)} type="password" />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">{t('settings.preferences')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('settings.uiLanguage')}</label>
              <select
                value={settings.uiLanguage || 'pt-BR'}
                onChange={(e) => {
                  const newLocale = e.target.value as Locale;
                  set('uiLanguage', newLocale);
                  setLocale(newLocale);
                  try {
                    const s = JSON.parse(localStorage.getItem('media_settings') || '{}');
                    s.uiLanguage = newLocale;
                    localStorage.setItem('media_settings', JSON.stringify(s));
                  } catch {}
                }}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white outline-none focus:border-sky-500/50 text-sm"
              >
                <option value="pt-BR">Português (PT-BR)</option>
              </select>
              <p className="text-[10px] text-gray-500 mt-1">{t('settings.uiLanguageDesc')}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('settings.defaultQuality')}</label>
              <select
                value={settings.defaultQuality}
                onChange={(e) => set('defaultQuality', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white outline-none focus:border-sky-500/50 text-sm"
              >
                <option value="2160p">2160p (4K)</option>
                <option value="1080p">1080p (Full HD)</option>
                <option value="720p">720p (HD)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('settings.audioPrefix')}</label>
              <select
                value={settings.preferLanguage}
                onChange={(e) => set('preferLanguage', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white outline-none focus:border-sky-500/50 text-sm"
              >
                <option value="pt">Português (PT-BR)</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.preferHevc}
              onChange={(e) => set('preferHevc', e.target.checked)}
              className="w-4 h-4 rounded accent-red-600"
            />
            <span className="text-sm text-gray-300">{t('settings.preferHevc')}</span>
          </label>
        </section>

        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all',
            'bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50'
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('settings.save')}
        </button>
      </div>
    </MediaLayout>
  );
}

function Input({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-gray-500 outline-none focus:border-sky-500/50 transition-all text-sm"
      />
    </div>
  );
}

function QbStatus() {
  const [status, setStatus] = useState<{ connected: boolean; message: string; version?: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const { t } = useI18n();

  const check = () => {
    setChecking(true);
    mediaApi.getQbittorrentStatus()
      .then((data) => setStatus(data))
      .catch(() => setStatus({ connected: false, message: t('settings.connectionError') }))
      .finally(() => setChecking(false));
  };

  useEffect(() => { check(); }, []);

  if (checking) {
    return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
  }

  if (!status) return null;

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium',
      status.connected
        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
        : 'bg-red-500/20 text-red-400 border border-red-500/30'
    )}>
      {status.connected ? (
        <><Wifi className="w-3 h-3" /> {status.version || t('settings.connected')}</>
      ) : (
        <><WifiOff className="w-3 h-3" /> {status.message}</>
      )}
    </span>
  );
}

function QbTestButton() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { t } = useI18n();

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const data = await mediaApi.testQbittorrent();
      setResult(data.success
        ? `✅ ${data.message}`
        : `❌ ${data.message}`
      );
    } catch (err: unknown) {
      setResult(err instanceof Error ? `❌ ${err.message}` : `❌ ${t('settings.connectionError')}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleTest}
        disabled={testing}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all',
          'bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 hover:text-white',
          'border border-white/[0.08] hover:border-white/20',
          testing && 'opacity-50 cursor-wait'
        )}
      >
        {testing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" />
        )}
        {t('settings.testConnection')}
      </button>
      {result && (
        <p className={cn(
          'text-xs px-3 py-2 rounded-lg',
          result.startsWith('✅') ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
        )}>
          {result}
        </p>
      )}
    </div>
  );
}
