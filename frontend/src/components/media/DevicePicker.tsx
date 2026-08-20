// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// DevicePicker — ícone de "transmitir" no player (TVzinha).
// Apenas fallback DLNA — sem Remote Playback API nativa.
import { useRef, useState } from 'react';
import { Cast, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useMediaToast } from './MediaToast';

interface DevicePickerProps {
  src: string;
  title?: string;
  mediaId?: string;
  mediaType?: 'movie' | 'series' | string;
  poster?: string;
  currentTime?: number;
  onCastStart?: (deviceName: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  variant?: 'button' | 'dropdown';
}

export default function DevicePicker({
  title,
  mediaId,
  mediaType,
  onCastStart,
}: DevicePickerProps) {
  const { t } = useI18n();
  const toast = useMediaToast();
  const [casting, setCasting] = useState(false);

  const handleCast = async () => {
    setCasting(true);

    try {
      const token = localStorage.getItem('media_token') || '';
      const resp = await fetch(
        `${import.meta.env.VITE_MEDIA_API_URL || '/media-api'}/devices/play`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            mediaId,
            mediaType,
            title,
          }),
        }
      );
      if (resp.ok) {
        toast.success('Transmitindo', 'DLNA iniciado');
        onCastStart?.('DLNA');
      } else {
        const data = await resp.json().catch(() => ({}));
        toast.error('Falha ao transmitir', data.error || 'Nenhum dispositivo DLNA encontrado');
      }
    } catch (err) {
      console.debug('[DevicePicker] DLNA failed:', err);
      toast.error('Falha ao transmitir', 'Erro de conexão');
    } finally {
      setCasting(false);
    }
  };

  return (
    <button
      onClick={handleCast}
      disabled={casting}
      title={t('devicePicker.castToTv') || 'Transmitir na TV'}
      aria-label={t('devicePicker.castToTv') || 'Transmitir na TV'}
      className="p-1.5 text-white/70 hover:text-white transition-colors disabled:opacity-50"
    >
      {casting ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Cast className="w-5 h-5" />
      )}
    </button>
  );
}
