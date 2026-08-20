// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { YoutubeIcon, InstagramIcon, TikTokIcon } from './SocialIcons';
import { Download, Loader2, AlertCircle, ExternalLink, Music, Video, CheckCircle2, FileAudio, ChevronDown, Images } from 'lucide-react';
import { cn } from '@/lib/utils';

type Platform = 'youtube' | 'instagram' | 'tiktok';
type Mode = 'download' | 'transcribe';
type Step = 'idle' | 'analyzing' | 'selecting' | 'downloading' | 'transcribing' | 'done' | 'error';

interface PlatformConfig {
  id: Platform;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  placeholder: string;
  description: string;
  pattern: RegExp;
}

interface FormatOption {
  formatId: string;
  label: string;
  quality: string;
  ext: string;
  filesize: number | null;
  filesizeFormatted: string | null;
  type: 'video' | 'audio';
  note: string | null;
}

interface MediaInfo {
  success: boolean;
  title?: string;
  thumbnail?: string;
  duration?: number | null;
  uploader?: string | null;
  platform?: string;
  formats?: FormatOption[];
  error?: string;
}

interface MediaResult {
  success: boolean;
  title?: string;
  mediaUrl?: string;
  directUrl?: string;
  thumbnail?: string;
  duration?: number;
  error?: string;
  source?: string;
  text?: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    icon: <YoutubeIcon className="w-6 h-6" />,
    placeholder: 'https://youtube.com/watch?v=...',
    description: 'Baixe vídeos em MP4 ou áudio em MP3 & Transcreva para texto',
    pattern: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)/i,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/20',
    icon: <InstagramIcon className="w-6 h-6" />,
    placeholder: 'https://instagram.com/p/...',
    description: 'Baixe vídeos, reels e fotos',
    pattern: /^https?:\/\/(www\.)?instagram\.com/i,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/20',
    icon: <TikTokIcon className="w-6 h-6" />,
    placeholder: 'https://tiktok.com/@user/video/...',
    description: "Baixe vídeos do TikTok sem marca d'água",
    pattern: /^https?:\/\/(www\.)?tiktok\.com/i,
  },
];

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function safeFetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const responseText = await res.text();

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `A API respondeu com formato inválido (HTTP ${res.status}). ` +
      `Resposta: "${responseText.substring(0, 200)}..."`
    );
  }

  if (!res.ok) {
    const errData = data as Record<string, unknown>;
    throw new Error(
      (typeof errData?.error === 'string' ? errData.error : null) ||
      `Erro HTTP ${res.status} ao processar a mídia.`
    );
  }

  return data as T;
}

async function downloadAsBlob(url: string, body: Record<string, unknown>): Promise<Blob> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errMsg = `Erro HTTP ${res.status}`;
    try {
      const errData = await res.json();
      errMsg = errData.error || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  return res.blob();
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
  }, 100);
}

export default function MediaDownloadHub({ onBack: _onBack }: ToolProps) {
  const [activePlatform, setActivePlatform] = useState<Platform | null>(null);
  const [mode, setMode] = useState<Mode>('download');
  const [urls, setUrls] = useState<Record<Platform, string>>({
    youtube: '',
    instagram: '',
    tiktok: '',
  });
  const [loading, setLoading] = useState<Platform | null>(null);
  const [step, setStep] = useState<Step>('idle');

  // Estado para dados do vídeo analisado
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>('');

  // Estado para resultado final
  const [result, setResult] = useState<MediaResult | null>(null);

  // Estado para download progress
  const [downloadProgress, setDownloadProgress] = useState<string>('');

  // Estado para carrossel de fotos
  const [isCarousel, setIsCarousel] = useState(false);

  const handleUrlChange = useCallback((platform: Platform, value: string) => {
    setUrls((prev) => ({ ...prev, [platform]: value }));
    setResult(null);
    setMediaInfo(null);
    setSelectedFormat('');
    setStep('idle');
    setDownloadProgress('');
  }, []);

  const handleAnalyze = useCallback(async (platform: Platform) => {
    const url = urls[platform]?.trim();
    if (!url) return;

    const platformConfig = PLATFORMS.find((p) => p.id === platform);
    if (platformConfig && !platformConfig.pattern.test(url)) {
      setStep('error');
      setResult({
        success: false,
        error: `Esta URL não parece ser do ${platformConfig.label}. Cole uma URL válida do ${platformConfig.label}.`,
      });
      return;
    }

    setLoading(platform);
    setResult(null);
    setMediaInfo(null);
    setSelectedFormat('');
    setStep('analyzing');
    setDownloadProgress('');

    try {
      // 1. Analisar o vídeo (obter formatos disponíveis)
      const info = await safeFetchJson<MediaInfo>('/api/proxy/media-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, platform }),
      });

      if (!info.success) {
        // Detectar se é carrossel de fotos do Instagram
        const isCarouselError = info.error?.toLowerCase().includes('foto') ||
          info.error?.toLowerCase().includes('carrossel') ||
          info.error?.toLowerCase().includes('carousel');

        if (isCarouselError && platform === 'instagram') {
          setIsCarousel(true);
          setStep('error');
          setResult({ success: false, error: info.error, source: platform });
          return;
        }

        setIsCarousel(false);
        setStep('error');
        setResult({ success: false, error: info.error, source: platform });
        return;
      }

      setIsCarousel(false);

      setMediaInfo(info);

      // Se modo transcrever, faz tudo em sequência
      if (mode === 'transcribe') {
        setStep('transcribing');
        try {
          const transcribeData = await safeFetchJson<MediaResult>('/api/proxy/media-transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });

          setResult({
            success: true,
            title: transcribeData.title || info.title,
            duration: info.duration || undefined,
            text: transcribeData.text,
          });
          setStep('done');
        } catch (transcribeErr: unknown) {
          setStep('error');
          const msg = transcribeErr instanceof Error ? transcribeErr.message : 'Erro ao transcrever';
          setResult({ success: false, error: msg });
        } finally {
          setLoading(null);
        }
        return;
      }

      // Modo download: mostrar seletor de formato
      if (info.formats && info.formats.length > 0) {
        // Auto-selecionar o primeiro formato (melhor qualidade)
        setSelectedFormat(info.formats[0].formatId);
        setStep('selecting');
      } else {
        setStep('error');
        setResult({ success: false, error: 'Nenhum formato disponível encontrado.', source: platform });
      }
    } catch (err: unknown) {
      setStep('error');
      const message = err instanceof Error ? err.message : 'Erro desconhecido ao processar';
      setResult({ success: false, error: message });
    } finally {
      setLoading(null);
    }
  }, [urls, mode]);

  const handleDownload = useCallback(async (platform: Platform) => {
    const url = urls[platform]?.trim();
    if (!url || !selectedFormat || !mediaInfo) return;

    setLoading(platform);
    setStep('downloading');
    setDownloadProgress('Iniciando download...');

    try {
      setDownloadProgress('Baixando do servidor...');

      const blob = await downloadAsBlob('/api/proxy/media-download', {
        url,
        platform,
        formatId: selectedFormat,
      });

      // Determinar extensão do arquivo
      const format = mediaInfo.formats?.find(f => f.formatId === selectedFormat);
      const ext = format?.ext || 'mp4';
      const title = sanitizeFilename(mediaInfo.title || 'download');
      const filename = `${title}.${ext}`;

      setDownloadProgress('Salvando arquivo...');
      triggerBlobDownload(blob, filename);

      setResult({
        success: true,
        title: mediaInfo.title,
        duration: mediaInfo.duration || undefined,
      });
      setStep('done');
    } catch (err: unknown) {
      setStep('error');
      const message = err instanceof Error ? err.message : 'Erro ao fazer download';
      setResult({ success: false, error: message });
    } finally {
      setLoading(null);
      setDownloadProgress('');
    }
  }, [urls, selectedFormat, mediaInfo]);

  const handleCarouselDownload = useCallback(async (platform: Platform) => {
    const url = urls[platform]?.trim();
    if (!url) return;

    setLoading(platform);
    setStep('downloading');
    setDownloadProgress('Baixando imagens do carrossel...');

    try {
      const blob = await downloadAsBlob('/api/proxy/media-carousel-download', { url });

      setDownloadProgress('Salvando ZIP...');
      const filename = `instagram_carrossel_${Date.now()}.zip`;
      triggerBlobDownload(blob, filename);

      setResult({
        success: true,
        title: 'Carrossel baixado',
      });
      setStep('done');
    } catch (err: unknown) {
      setStep('error');
      const message = err instanceof Error ? err.message : 'Erro ao baixar carrossel';
      setResult({ success: false, error: message });
    } finally {
      setLoading(null);
      setDownloadProgress('');
    }
  }, [urls]);

  const currentPlatform = activePlatform ? PLATFORMS.find((p) => p.id === activePlatform) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {!activePlatform ? (
        <>
          <p className="text-sm text-[#A1A1AA] text-center mb-2">
            Selecione a plataforma para começar
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                onClick={() => setActivePlatform(platform.id)}
                className={cn(
                  'group relative text-left rounded-2xl border p-6 transition-all duration-300',
                  'hover:scale-[1.02] active:scale-[0.98]',
                  platform.bgColor,
                  platform.borderColor,
                  'bg-white/[0.02] hover:bg-white/[0.06]'
                )}
              >
                <div className={cn(
                  'w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border-2',
                  platform.bgColor,
                  platform.borderColor,
                  'group-hover:scale-110 transition-transform duration-300'
                )}>
                  <div className={platform.color}>{platform.icon}</div>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{platform.label}</h3>
                <p className="text-sm text-[#A1A1AA] leading-relaxed">{platform.description}</p>
                <div className={cn(
                  'mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                  'bg-white/[0.06] hover:bg-white/[0.12] text-white'
                )}>
                  <Download className="w-4 h-4" /> Baixar
                </div>
              </button>
            ))}
          </div>
        </>
      ) : currentPlatform && (
        <>
          <button
            onClick={() => {
              setActivePlatform(null);
              setResult(null);
              setMediaInfo(null);
              setSelectedFormat('');
              setStep('idle');
              setDownloadProgress('');
            }}
            className="inline-flex items-center gap-2 text-sm text-[#A1A1AA] hover:text-white transition-colors"
          >
            ← Voltar para plataformas
          </button>

          <div className="space-y-4">
            {/* Header da plataforma */}
            <div className={cn('flex items-center gap-3 p-4 rounded-xl', currentPlatform.bgColor, currentPlatform.borderColor, 'border')}>
              <div className={currentPlatform.color}>{currentPlatform.icon}</div>
              <div>
                <h3 className="text-sm font-semibold text-white">{currentPlatform.label}</h3>
                <p className="text-xs text-[#A1A1AA]">{currentPlatform.description}</p>
              </div>
            </div>

            {/* Toggle Download / Transcrever */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMode('download');
                  setMediaInfo(null);
                  setSelectedFormat('');
                  setResult(null);
                  setStep('idle');
                }}
                className={cn(
                  'flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2',
                  mode === 'download'
                    ? 'bg-green-600 text-white'
                    : 'bg-white/[0.04] text-[#A1A1AA] hover:bg-white/[0.08] hover:text-white border border-white/[0.08]'
                )}
              >
                <Video className="w-4 h-4" /> Download
              </button>
              <button
                onClick={() => {
                  setMode('transcribe');
                  setMediaInfo(null);
                  setSelectedFormat('');
                  setResult(null);
                  setStep('idle');
                }}
                className={cn(
                  'flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2',
                  mode === 'transcribe'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/[0.04] text-[#A1A1AA] hover:bg-white/[0.08] hover:text-white border border-white/[0.08]'
                )}
              >
                <Music className="w-4 h-4" /> Transcrever
              </button>
            </div>

            {/* Input de URL */}
            <div className="flex gap-2">
              <input
                type="url"
                value={urls[activePlatform]}
                onChange={(e) => handleUrlChange(activePlatform, e.target.value)}
                placeholder={currentPlatform.placeholder}
                className={cn(
                  'flex-1 px-4 py-3 rounded-xl text-sm transition-all duration-200',
                  'bg-white/[0.04] border border-white/[0.08]',
                  'text-white placeholder:text-[#A1A1AA]',
                  'outline-none focus:border-white/[0.12] focus:bg-white/[0.06]'
                )}
                disabled={loading === activePlatform}
              />
              <button
                onClick={() => handleAnalyze(activePlatform)}
                disabled={loading === activePlatform || !urls[activePlatform]?.trim()}
                className={cn(
                  'px-6 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shrink-0 text-white',
                  loading === activePlatform
                    ? 'bg-white/10 cursor-wait'
                    : mode === 'download'
                      ? 'bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {loading === activePlatform ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</>
                ) : mode === 'download' ? (
                  <><Download className="w-4 h-4" /> Analisar</>
                ) : (
                  <><Music className="w-4 h-4" /> Transcrever</>
                )}
              </button>
            </div>

            {/* Indicador de progresso por etapas */}
            {loading && step !== 'idle' && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className={cn(step === 'analyzing' ? 'text-blue-400 font-medium' : step === 'selecting' || step === 'downloading' || step === 'transcribing' || step === 'done' ? 'text-green-400' : 'text-[#A1A1AA]')}>
                    {step === 'analyzing' ? '●' : '✓'} Analisando
                  </span>
                  {mode === 'download' && (
                    <span className={cn(step === 'selecting' ? 'text-blue-400 font-medium' : step === 'downloading' || step === 'done' ? 'text-green-400' : 'text-[#A1A1AA]')}>
                      {step === 'selecting' ? '●' : (step === 'downloading' || step === 'done') ? '✓' : '○'} Selecionando
                    </span>
                  )}
                  {mode === 'download' && (
                    <span className={cn(step === 'downloading' ? 'text-blue-400 font-medium' : step === 'done' ? 'text-green-400' : 'text-[#A1A1AA]')}>
                      {step === 'downloading' ? '●' : step === 'done' ? '✓' : '○'} Download
                    </span>
                  )}
                  {mode === 'transcribe' && (
                    <span className={cn(step === 'transcribing' ? 'text-blue-400 font-medium' : step === 'done' ? 'text-green-400' : 'text-[#A1A1AA]')}>
                      {step === 'transcribing' ? '●' : step === 'done' ? '✓' : '○'} Transcrevendo
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Download progress text */}
            {downloadProgress && (
              <p className="text-xs text-blue-400 text-center">{downloadProgress}</p>
            )}

            {/* Sucesso - copiar transcrição */}
            {result && result.success && result.text && (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-green-400">✓ Transcrição concluída</h4>
                    <p className="text-xs text-[#A1A1AA] mt-1">
                      {result.text.length} caracteres • {result.title}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(result.text || '');
                    }}
                    className="px-4 py-2 rounded-lg bg-green-600/20 hover:bg-green-600/30 text-green-300 text-xs font-medium transition-colors border border-green-500/20 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M8 5.5a2.5 2.5 0 015 0v3a2.5 2.5 0 01-5 0v-3Z" />
                    </svg>
                    Copiar Texto
                  </button>
                </div>
              </div>
            )}

            {/* Erro */}
            {result && !result.success && result.error && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-400">{result.error}</p>
                    {result.source && (
                      <p className="text-xs text-[#A1A1AA] mt-1">Plataforma: {result.source}</p>
                    )}
                  </div>
                </div>

                {/* Botão de download de carrossel */}
                {isCarousel && activePlatform && (
                  <button
                    onClick={() => handleCarouselDownload(activePlatform)}
                    disabled={loading === activePlatform}
                    className={cn(
                      'w-full px-6 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 text-white',
                      loading === activePlatform
                        ? 'bg-white/10 cursor-wait'
                        : 'bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700'
                    )}
                  >
                    {loading === activePlatform ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Baixando imagens...</>
                    ) : (
                      <><Images className="w-4 h-4" /> Baixar Fotos como ZIP</>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* ═══ SELETOR DE FORMATO (após análise) ═══ */}
            {mediaInfo && mediaInfo.success && mediaInfo.formats && step === 'selecting' && (
              <div className="space-y-4">
                {/* Preview do vídeo */}
                <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  {mediaInfo.thumbnail && (
                    <img
                      src={mediaInfo.thumbnail}
                      alt={mediaInfo.title}
                      className="w-32 h-20 object-cover rounded-lg shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate">{mediaInfo.title}</h4>
                    {mediaInfo.uploader && (
                      <p className="text-xs text-[#A1A1AA] mt-0.5">{mediaInfo.uploader}</p>
                    )}
                    {mediaInfo.duration && (
                      <p className="text-xs text-[#A1A1AA]">Duração: {formatDuration(mediaInfo.duration)}</p>
                    )}
                  </div>
                </div>

                {/* Lista de formatos disponíveis */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <label className="block text-xs font-medium text-[#A1A1AA] mb-3 uppercase tracking-wider">
                    Formatos Disponíveis ({mediaInfo.formats.length})
                  </label>

                  <div className="space-y-2">
                    {mediaInfo.formats.map((format) => (
                      <label
                        key={format.formatId}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all',
                          'border',
                          selectedFormat === format.formatId
                            ? 'bg-green-600/10 border-green-500/30'
                            : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.10]'
                        )}
                      >
                        <input
                          type="radio"
                          name="format"
                          value={format.formatId}
                          checked={selectedFormat === format.formatId}
                          onChange={() => setSelectedFormat(format.formatId)}
                          className="sr-only"
                        />
                        <div className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                          selectedFormat === format.formatId
                            ? 'border-green-500 bg-green-500'
                            : 'border-white/20'
                        )}>
                          {selectedFormat === format.formatId && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {format.type === 'audio' ? (
                              <FileAudio className="w-4 h-4 text-purple-400 shrink-0" />
                            ) : (
                              <Video className="w-4 h-4 text-green-400 shrink-0" />
                            )}
                            <span className="text-sm text-white font-medium">{format.label}</span>
                          </div>
                          {format.note && (
                            <p className="text-xs text-[#A1A1AA] mt-0.5 ml-6">{format.note}</p>
                          )}
                        </div>
                        {format.filesizeFormatted && (
                          <span className="text-xs text-[#A1A1AA] bg-white/[0.06] px-2 py-1 rounded-lg shrink-0">
                            {format.filesizeFormatted}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Botão de Download */}
                <button
                  onClick={() => handleDownload(activePlatform)}
                  disabled={!selectedFormat || loading === activePlatform}
                  className={cn(
                    'w-full px-6 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 text-white',
                    loading === activePlatform
                      ? 'bg-white/10 cursor-wait'
                      : 'bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {loading === activePlatform ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Baixando...</>
                  ) : (
                    <><Download className="w-4 h-4" /> Baixar Arquivo</>
                  )}
                </button>
              </div>
            )}

            {/* ═══ SUCESSO ═══ */}
            {result && result.success && step === 'done' && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-green-400 font-medium">
                    {mode === 'download' ? 'Download concluído!' : 'Transcrição concluída!'}
                  </p>
                  {result.title && (
                    <p className="text-xs text-[#A1A1AA] mt-1">{result.title}</p>
                  )}
                  {result.duration && (
                    <p className="text-xs text-[#A1A1AA]">Duração: {formatDuration(result.duration)}</p>
                  )}
                  {mode === 'transcribe' && result.text && (
                    <div className="mt-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] max-h-60 overflow-y-auto">
                      <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">{result.text}</p>
                    </div>
                  )}
                  {mode === 'download' && (
                    <p className="text-xs text-green-400/70 mt-2">
                      O arquivo foi baixado diretamente no seu navegador.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Nota */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-xs text-[#A1A1AA]/70 leading-relaxed">
                <strong className="text-white">Como funciona:</strong> Cole um link, clique em{' '}
                <code className="text-[10px] bg-white/[0.06] px-1 py-0.5 rounded">
                  {mode === 'download' ? 'Analisar' : 'Transcrever'}
                </code>
                {' '}para ver as opções disponíveis. Selecione a qualidade e clique em{' '}
                <code className="text-[10px] bg-white/[0.06] px-1 py-0.5 rounded">Baixar</code>.
                O arquivo é baixado diretamente no seu navegador, sem redirecionamentos.
                {currentPlatform.id === 'instagram' && (
                  <> <strong className="text-yellow-400">Nota:</strong> Instagram pode bloquear downloads de contas privadas.</>
                )}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200) || 'download';
}
