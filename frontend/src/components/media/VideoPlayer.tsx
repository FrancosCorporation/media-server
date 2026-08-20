// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Loader2, AlertCircle, ArrowLeft, Undo2, Redo2,
  ChevronsLeft, ChevronsRight, Sun, Volume1, Subtitles
} from 'lucide-react';
import DevicePicker from './DevicePicker';
import { cn } from '@/lib/utils';
import { useMediaToast } from './MediaToast';
import { useI18n } from '@/i18n';

const MEDIA_API = import.meta.env.VITE_MEDIA_API_URL || '/dolfimflix/api';

function extractStreamPath(url: string): string | null {
  const match = url.match(/\/stream\/(.+?)(?:\?|$)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseStartFromUrl(url: string): number {
  const match = url.match(/[?&]start=(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function isTranscodedSrc(url: string): boolean {
  return url.includes('transcode=true') || url.includes('transcode=1');
}

// Seek nativo instantâneo: usa fastSeek (pula para o keyframe mais próximo no
// Chromium, sem aguardar decode completo) quando disponível — o seek da barra
// e do double-tap responde imediatamente, sem "áudio antes do vídeo".
function seekNative(v: HTMLVideoElement, time: number): void {
  const fast = (v as unknown as { fastSeek?: (t: number) => void }).fastSeek;
  if (typeof fast === 'function') fast.call(v, time);
  else v.currentTime = time;
}

interface VideoPlayerProps {
  src: string;
  title?: string;
  poster?: string;
  mediaId?: string;
  mediaType?: 'movie' | 'series' | string;
  onEnded?: () => void;
  initialTime?: number;
  initialDuration?: number;
  onProgressSave?: (currentTime: number, duration: number) => void;
  onBack?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  subtitles?: { label: string; src: string }[];
  onSubtitleToggle?: (active: boolean) => void;
  subtitleActive?: boolean;
  speed?: number;
  onSpeedChange?: (speed: number) => void;
}

export default function VideoPlayer({ src, title, poster, mediaId, mediaType, onEnded, initialTime, initialDuration, onProgressSave, onBack, onNext, onPrev, hasNext = false, hasPrev = false, subtitles = [], onSubtitleToggle, subtitleActive = false, speed = 1, onSpeedChange }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' } | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  // Acumulador de duplo toque (estilo YouTube): N toques no mesmo lado → (N-1)*10s
  const tapAccumRef = useRef<{ side: 'left' | 'right'; count: number; timer: ReturnType<typeof setTimeout> | null }>({
    side: 'right',
    count: 0,
    timer: null,
  });
  const isTouchScrubRef = useRef(false);
  // Swipe vertical para brilho (lado esquerdo) e volume (lado direito)
  const swipeStartRef = useRef<{ y: number; x: number; side: 'left' | 'right'; time: number; startValue: number } | null>(null);
  const [brightness, setBrightness] = useState(1);
  const [showBrightnessBar, setShowBrightnessBar] = useState(false);
  const [showVolumeBar, setShowVolumeBar] = useState(false);
  const swipeFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useI18n();

const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverThumbnail, setHoverThumbnail] = useState<string | null>(null);
  const hoverThumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPathRef = useRef<string>('');
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSrc, setCurrentSrc] = useState(src);
  // Feedback visual do duplo toque (acumulado): ex. { delta: 20 } = "+20s"
  const [skipFeedback, setSkipFeedback] = useState<{ delta: number; id: number } | null>(null);
  // Countdown para auto-play next (5s após fim do vídeo)
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialTimeAppliedRef = useRef(false);
  const hlsRef = useRef<Hls | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 1;
  // Transcode streams are re-encoded with `-ss X`, so the browser's currentTime
  // is RELATIVE to X. This ref stores X (absolute source time) so the progress
  // bar thumb can display absolute time even after a seek-reload resets currentTime to 0.
  const transcodeOffsetRef = useRef(0);
  const hoverFetchTimeRef = useRef<number>(-1);
  // true enquanto o usuário arrasta a barra de progresso (scrub).
  // Durante o scrub: suppress de timeupdate (a barra segue a mão, não o vídeo)
  // e o seek SÓ é aplicado no release (debounce) — evita múltiplos reloads
  // de transcode que dessincronizam áudio/vídeo.
  const scrubbingRef = useRef(false);

  const toast = useMediaToast();

  // Keep the transcode offset in sync with the `start=` param of the current src.
  useEffect(() => {
    transcodeOffsetRef.current = isTranscodedSrc(currentSrc) ? parseStartFromUrl(currentSrc) : 0;
  }, [currentSrc]);

  // ─── Detect if URL is HLS (m3u8) or non-browser-compatible format ──
  const isHLSUrl = useCallback((url: string) => {
    return url.includes('.m3u8') || url.includes('hls-cached');
  }, []);

  // ─── Detect if file is MKV/non-browser-compatible for immediate HLS fallback ──
  const needsHlsTranscode = useCallback((url: string): boolean => {
    const lower = url.toLowerCase();
    // Formatos que navegadores não suportam nativamente
    const incompatibleExts = ['.mkv', '.avi'];
    const hasIncompatibleExt = incompatibleExts.some(ext => 
      lower.endsWith(ext) || lower.includes(ext + '?') || lower.includes(ext + '&')
    );
    if (hasIncompatibleExt) return true;
    // Codecs HEVC/x265 no nome do arquivo
    if (lower.includes('x265') || lower.includes('hevc') || lower.includes('h265') || lower.includes('h.265')) return true;
    return false;
  }, []);

  // ─── Video type detection ───────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

if (isHLSUrl(currentSrc)) {
       if (Hls.isSupported()) {
         const hls = new Hls({
           enableWorker: true,
           lowLatencyMode: false,
           capLevelToPlayerSize: true,
           maxBufferLength: 30,
           maxMaxBufferLength: 60,
           startFragPrefetch: true,
           startLevel: -1, // auto
         });
          hlsRef.current = hls;
          hls.loadSource(currentSrc);
         hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          v.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            retryCountRef.current += 1;
            if (retryCountRef.current > MAX_RETRIES) {
              setError(t('videoPlayer.errorLoadingVideo'));
              hls.destroy();
              return;
            }
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                setError(t('videoPlayer.errorLoadingVideo'));
                hls.destroy();
                break;
            }
          }
        });
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        v.src = currentSrc;
      } else {
        setError(t('videoPlayer.formatNotSupported'));
      }
    } else {
      // Non-HLS: use native src
      v.src = currentSrc;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentSrc, isHLSUrl, t]);

  // ─── Sync initialDuration ─────────────────────────────────────────
  useEffect(() => {
    if (initialDuration && initialDuration > 0 && (!duration || duration === 0)) {
      setDuration(initialDuration);
    }
  }, [initialDuration]);

  // ─── Auto-play ao montar ───────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // For HLS, the MANIFEST_PARSED event handles auto-play
    if (isHLSUrl(currentSrc)) return;
    const tryPlay = () => {
      if (v.paused) v.play().catch(() => {});
    };
    v.addEventListener('canplay', tryPlay, { once: true });
    const timer = setTimeout(tryPlay, 500);
    return () => {
      v.removeEventListener('canplay', tryPlay);
      clearTimeout(timer);
    };
  }, [currentSrc, isHLSUrl]);

  // ─── Controles de vídeo ───────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }, []);

  // ─── Video type detection ───────────────────────────────────────────
  const isTranscoded = useCallback(() => {
    return currentSrc.includes('transcode=true') || currentSrc.includes('transcode=1');
  }, [currentSrc]);

  // ─── Improved seek function ─────────────────────────────────────────
  const improvedSeekTo = useCallback((time: number) => {
    const v = videoRef.current;
    if (!v) return;

    // Use state duration (ffprobe) instead of v.duration (may be Infinity for HLS)
    const totalDuration = duration > 0 ? duration : (isFinite(v.duration) ? v.duration : 0);
    const clampedTime = Math.max(0, Math.min(time, totalDuration));
    
    // Update progress immediately for responsive UI
    setCurrentTime(clampedTime);
    
    if (isHLSUrl(currentSrc)) {
      // HLS supports native seeking — set currentTime directly
      transcodeOffsetRef.current = 0;
      seekNative(v, clampedTime);
    } else if (isTranscoded()) {
      // For transcode videos, need to reload from seek position
      // The 'start' query param tells the server where to begin — no need to set currentTime
      transcodeOffsetRef.current = clampedTime;
      const baseSrc = currentSrc.replace(/[?&]start=\d+/g, '').replace(/\?$/, '');
      const sep = baseSrc.includes('?') ? '&' : '?';
      const newSrc = `${baseSrc}${sep}start=${Math.floor(clampedTime)}`;
      setCurrentSrc(newSrc);
      v.load();
      v.play().catch(() => {});
    } else {
      // Standard video seeking
      transcodeOffsetRef.current = 0;
      seekNative(v, clampedTime);
    }
  }, [currentSrc, duration, isTranscoded, isHLSUrl]);

  const seekTo = useCallback((time: number) => {
    improvedSeekTo(time);
  }, [improvedSeekTo]);

  const seek = useCallback((time: number) => {
    const v = videoRef.current;
    if (!v) return;
    // Use state duration (ffprobe) instead of v.duration (may be Infinity for HLS)
    const totalDuration = duration > 0 ? duration : (isFinite(v.duration) ? v.duration : 0);
    const newTime = Math.max(0, Math.min(totalDuration, time));
    // HLS supports native seeking
    if (isHLSUrl(currentSrc) || !isTranscoded()) {
      seekNative(v, newTime);
    } else {
      improvedSeekTo(newTime);
    }
  }, [currentSrc, isTranscoded, isHLSUrl, improvedSeekTo]);

  const skip = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    // Use state duration (ffprobe) instead of v.duration (may be Infinity for HLS)
    const totalDuration = duration > 0 ? duration : (isFinite(v.duration) ? v.duration : 0);
    // POSIÇÃO ABSOLUTA: em streams transcode o currentTime do elemento é RELATIVO
    // ao início do transcode (start=X) e zera a cada seek-reload. Sem somar o
    // offset, o skip "volta pro começo do filme +10s" em vez de pular do ponto
    // atual — e nunca acumula (10s+10s+...).
    const absCurrent = transcodeOffsetRef.current + v.currentTime;
    const newTime = Math.max(0, Math.min(totalDuration, absCurrent + seconds));
    // HLS supports native seeking
    if (isHLSUrl(currentSrc) || !isTranscoded()) {
      seekNative(v, newTime);
    } else {
      improvedSeekTo(newTime);
    }
  }, [currentSrc, isTranscoded, isHLSUrl, improvedSeekTo]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, val));
    setVolume(v.volume);
    if (v.volume > 0 && v.muted) { v.muted = false; setMuted(false); }
  }, []);

  const changeBrightness = useCallback((val: number) => {
    const newBrightness = Math.max(0.1, Math.min(1, val));
    setBrightness(newBrightness);
    if (containerRef.current) {
      containerRef.current.style.filter = `brightness(${newBrightness})`;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    if (!document.fullscreenElement) {
      c.requestFullscreen?.().then(() => {
        if ((screen.orientation as any)?.lock) {
          (screen.orientation as any).lock('landscape').catch(() => {});
        }
      }).catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  // Reset retry count when src changes so each new source gets a fresh retry attempt
  useEffect(() => {
    retryCountRef.current = 0;
    setError(null);
    // P6 ZERO DELAY: não converte mais URL automaticamente. O arquivo já deve
    // ser compatível (H.264/AAC/MP4) graças ao MediaPostProcessor.
    setCurrentSrc(src);
  }, [src]);

  // ─── Injeção de Media Session API (unifica o controle de mídia do navegador) ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'DolfinFlix',
        artist: 'Francos Corp + DolfinFlix',
        artwork: poster
          ? [{ src: poster, sizes: '512x512', type: 'image/jpeg' }]
          : [{ src: '', sizes: '512x512', type: 'image/jpeg' }],
      });
    }
  }, [playing, title, poster]);

  // ─── onEndedHandler (top-level hook, outside useEffect) ─────────────
  const onEndedHandler = useCallback(() => {
    setPlaying(false);
    // Auto-play next (Regra 5: séries — ao terminar episódio, conta 5s e inicia o próximo)
    if (onEnded) {
      // Delay de 5s antes de chamar onEnded (auto-play)
      playTimerRef.current = setTimeout(() => {
        onEnded();
        playTimerRef.current = null;
      }, 5000);
    }
  }, [onEnded]);

  // ─── Event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTimeUpdate = () => {
      // Durante o scrub da barra a barra reflete a posição da mão,
      // não o vídeo — evita que timeupdate "brigue" com o drag.
      if (scrubbingRef.current) return;
      // Update current time in real-time for responsive UI.
      // For transcoded streams the browser reports time relative to the transcode
      // start (currentTime resets to 0 after a seek-reload) — add the offset so
      // the slider thumb never snaps back to zero.
      const offset = isTranscodedSrc(currentSrc) ? transcodeOffsetRef.current : 0;
      const newTime = offset + v.currentTime;
      setCurrentTime(newTime);
      
      // Track buffered range for progress bar
      if (v.buffered.length > 0) {
        const end = offset + v.buffered.end(v.buffered.length - 1);
        setBufferedEnd(end);
      }

      // Only update duration from video element if it's finite and reasonable
      // For HLS/transcoded streams, video.duration may be Infinity — keep ffprobe duration
      if (v.duration && isFinite(v.duration) && v.duration > 0 && v.duration < 100000) {
        setDuration(prev => {
          // Preserve ffprobe duration if video reports Infinity or wildly different value
          if (prev > 0 && prev < 100000) return prev;
          return v.duration;
        });
      }
    };
    const onDurationChange = () => {
      if (v.duration && isFinite(v.duration) && v.duration > 0 && v.duration < 100000) {
        setDuration(prev => {
          if (prev > 0 && prev < 100000) return prev;
          return v.duration;
        });
      }
    };
    const onLoadedMetadata = () => {
      if (v.duration && isFinite(v.duration) && v.duration > 0 && v.duration < 100000) {
        setDuration(prev => {
          if (prev > 0 && prev < 100000) return prev;
          return v.duration;
        });
      }
    };
    const onLoadStart = () => {
      setLoading(true);
    };
    const onCanPlay = () => {
      setLoading(false);
      if (v.duration && isFinite(v.duration) && v.duration > 0 && v.duration < 100000) {
        setDuration(prev => {
          if (prev > 0 && prev < 100000) return prev;
          return v.duration;
        });
      }
      if (v.paused) {
        v.play().catch(() => {});
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => {
      // Skip error events when HLS.js is active — it handles errors internally
      if (hlsRef.current) return;
      const mediaError = v.error;
      let msg = t('videoPlayer.errorLoadingVideo');
      if (mediaError && typeof mediaError === 'object') {
        const errorCode = mediaError.code;
        if (errorCode === 4) {
          // MEDIA_ERR_DECODE — codec incompatível (ex: AC3 no Chrome, HEVC, etc.)
          msg = t('videoPlayer.decodeError');
        }
      }
      setError(msg);
    };
     const onWaiting = () => {
       // If waiting for too long, the network might be stalled — attempt recovery
      setTimeout(() => {
          const v = videoRef.current;
          if (v && v.readyState < 3 && !v.paused && !v.ended) {
            v.load();
          }
        }, 5000);
     };
     const onStalled = () => {
       const v = videoRef.current;
       if (v) {
         v.load();
         v.play().catch(() => {});
       }
     };
      const onSeeked = () => {
        // Realinha áudio/vídeo após seek: micro pause/play força o decoder a
        // re-sincronizar (evita áudio dessincronizado após clicar na barra).
        if (scrubbingRef.current) return;
        const el = videoRef.current;
        if (el && !el.paused) {
          el.pause();
          requestAnimationFrame(() => {
            if (el && !el.paused) el.play().catch(() => {});
          });
        }
        // Salva progresso imediatamente após seek
        if (onProgressSave) {
          const absTime = transcodeOffsetRef.current + el!.currentTime;
          const dur = duration > 0 ? duration : (el!.duration > 0 && isFinite(el!.duration) ? el!.duration : 0);
          if (absTime > 0 && dur > 0) onProgressSave(absTime, dur);
        }
      };
    const onFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement && (screen.orientation as any)?.unlock) {
        (screen.orientation as any).unlock();
      }
    };

    v.addEventListener('loadstart', onLoadStart);
    v.addEventListener('loadedmetadata', onLoadedMetadata);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEndedHandler);
    v.addEventListener('error', onError);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('stalled', onStalled);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('durationchange', onDurationChange);
    v.addEventListener('seeked', onSeeked);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      v.removeEventListener('loadstart', onLoadStart);
      v.removeEventListener('loadedmetadata', onLoadedMetadata);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEndedHandler);
      v.removeEventListener('error', onError);
      v.removeEventListener('waiting', onWaiting);
       v.removeEventListener('stalled', onStalled);
       v.removeEventListener('timeupdate', onTimeUpdate);
       v.removeEventListener('durationchange', onDurationChange);
       v.removeEventListener('seeked', onSeeked);
document.removeEventListener('fullscreenchange', onFullscreenChange);
      };
   }, [onEnded, currentSrc, isHLSUrl, t, src]);

  // ─── Auto-hide dos controles ──────────────────────────────────────
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  }, [playing]);

  // ─── Aplica initialTime quando o vídeo está pronto ─────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !initialTime) return;

    const applySeek = () => {
      if (initialTimeAppliedRef.current) return;
      if (v.readyState >= 1 && v.duration > 0) {
        // HLS supports native seeking
        if (isHLSUrl(currentSrc)) {
          transcodeOffsetRef.current = 0;
          v.currentTime = initialTime;
        } else if (isTranscoded()) {
          transcodeOffsetRef.current = initialTime;
          const baseSrc = currentSrc.replace(/[?&]start=\d+/g, '').replace(/\?$/, '');
          const sep = baseSrc.includes('?') ? '&' : '?';
          const newSrc = `${baseSrc}${sep}start=${Math.floor(initialTime)}`;
          setCurrentSrc(newSrc);
          v.load();
          v.play().catch(() => {});
        } else {
          transcodeOffsetRef.current = 0;
          v.currentTime = initialTime;
        }
        initialTimeAppliedRef.current = true;
      }
    };

    applySeek();
    v.addEventListener('loadedmetadata', applySeek);
    v.addEventListener('canplay', applySeek);
    const poll = setInterval(() => {
      if (initialTimeAppliedRef.current) { clearInterval(poll); return; }
      if (v.readyState >= 1 && v.duration > 0) {
        if (isHLSUrl(currentSrc)) {
          transcodeOffsetRef.current = 0;
          v.currentTime = initialTime;
        } else if (isTranscoded()) {
          transcodeOffsetRef.current = initialTime;
          const baseSrc = currentSrc.replace(/[?&]start=\d+/g, '').replace(/\?$/, '');
          const sep = baseSrc.includes('?') ? '&' : '?';
          const newSrc = `${baseSrc}${sep}start=${Math.floor(initialTime)}`;
          setCurrentSrc(newSrc);
          v.load();
          v.play().catch(() => {});
        } else {
          transcodeOffsetRef.current = 0;
          v.currentTime = initialTime;
        }
        initialTimeAppliedRef.current = true;
        clearInterval(poll);
      }
    }, 200);
    return () => {
      v.removeEventListener('loadedmetadata', applySeek);
      v.removeEventListener('canplay', applySeek);
      clearInterval(poll);
    };
  }, [initialTime, currentSrc, isTranscoded, isHLSUrl]);

  // ─── Salva progresso periodicamente ────────────────────────────────
  useEffect(() => {
    if (!onProgressSave) return;
    const v = videoRef.current;
    if (!v) return;

    const saveProgress = () => {
      // Save ABSOLUTE position: for transcode streams currentTime is relative to
      // the transcode start, so add the offset for correct resume.
      const absTime = transcodeOffsetRef.current + v.currentTime;
      // Use state duration (from ffprobe) instead of v.duration (may be Infinity for HLS)
      const dur = duration > 0 ? duration : (v.duration > 0 && isFinite(v.duration) ? v.duration : 0);
      if (absTime > 0 && dur > 0) {
        if (onProgressSave) onProgressSave(absTime, dur);
      }
    };

    // Beacon: garante que o POST de progresso sobreviva ao unmount/route
    // change/pagehide — fetch normal é abortado no teardown, sendBeacon não.
    const beaconProgress = () => {
      const el = videoRef.current;
      if (!el) return;
      const absTime = transcodeOffsetRef.current + el.currentTime;
      const dur = el.duration;
      if (absTime <= 0 || dur <= 0 || !isFinite(dur)) return;
      const token = localStorage.getItem('media_token') || '';
      const url = `${MEDIA_API}/watch-progress${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const payload = JSON.stringify({
        mediaId,
        mediaType,
        currentTime: Math.floor(absTime),
        duration: Math.floor(dur),
      });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      } else if (typeof navigator !== 'undefined') {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    };

    const interval = setInterval(saveProgress, 10000);
    // Also save immediately on pause
    const onPauseSave = () => saveProgress();
    const onPageHide = () => beaconProgress();
    v.addEventListener('pause', onPauseSave);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(interval);
      v.removeEventListener('pause', onPauseSave);
      window.removeEventListener('pagehide', onPageHide);
      // Save on unmount (fetch seria abortado aqui — usa beacon)
      saveProgress();
      beaconProgress();
    };
  }, [onProgressSave, mediaId, mediaType]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': e.preventDefault(); skip(-10); break;
        case 'ArrowRight': e.preventDefault(); skip(10); break;
        case 'ArrowUp': e.preventDefault(); changeVolume(Math.min(1, volume + 0.1)); break;
        case 'ArrowDown': e.preventDefault(); changeVolume(Math.max(0, volume - 0.1)); break;
        case 'f': e.preventDefault(); toggleFullscreen(); break;
        case 'm': e.preventDefault(); toggleMute(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, skip, volume, changeVolume, toggleFullscreen, toggleMute]);

  // ─── Touch: swipe up/down = fullscreen, double-tap sides = seek ±10s ──
  // Duplo toque acumula (estilo YouTube): 2 toques = 10s, 3 toques = 20s, 4 = 30s.
  // Swipe vertical: lado esquerdo = brilho, lado direito = volume.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;

    // Toques que começam na barra de progresso/controles não são taps do player
    const isInControls = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return !!target.closest('[data-controls]') || !!target.closest('[data-progress]');
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (isInControls(e.target)) return;
      const touch = e.touches[0];
      const cRect = c.getBoundingClientRect();
      const side: 'left' | 'right' = touch.clientX >= cRect.left + cRect.width / 2 ? 'right' : 'left';
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      swipeStartRef.current = { y: touch.clientY, x: touch.clientX, side, time: Date.now(), startValue: side === 'right' ? volume : brightness };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!swipeStartRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const startY = swipeStartRef.current.y;
      const deltaY = startY - touch.clientY; // positivo = swipe para cima
      const elapsed = Date.now() - swipeStartRef.current.time;

      if (Math.abs(deltaY) < 10) return; // ignora toques pequenos
      if (Math.abs(touch.clientX - swipeStartRef.current.x) > 30) return; // não é swipe vertical

      const cRect = c.getBoundingClientRect();
      const side = touch.clientX >= cRect.left + cRect.width / 2 ? 'right' : 'left';
      if (side !== swipeStartRef.current.side) return;

      const sensitivity = 0.003;
      if (side === 'right') {
        const newVol = Math.max(0, Math.min(1, swipeStartRef.current.startValue + deltaY * sensitivity));
        changeVolume(newVol);
        setShowVolumeBar(true);
        setShowBrightnessBar(false);
      } else {
        const newBright = Math.max(0.1, Math.min(1, swipeStartRef.current.startValue + deltaY * sensitivity));
        changeBrightness(newBright);
        setShowBrightnessBar(true);
        setShowVolumeBar(false);
      }

      if (swipeFeedbackTimerRef.current) clearTimeout(swipeFeedbackTimerRef.current);
      swipeFeedbackTimerRef.current = setTimeout(() => {
        setShowBrightnessBar(false);
        setShowVolumeBar(false);
      }, 1500);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || e.changedTouches.length !== 1) return;
      const start = touchStartRef.current;
      const end = e.changedTouches[0];
      const deltaY = end.clientY - start.y;
      const deltaX = end.clientX - start.x;
      const elapsed = Date.now() - start.time;
      touchStartRef.current = null;
      swipeStartRef.current = null;

      if (elapsed > 500) return;

      const cRect = c.getBoundingClientRect();
      const isSwipe = Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 50;
      if (isSwipe) {
        // swipe vertical: fullscreen toggle
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          if (deltaY < -50 && !document.fullscreenElement) {
            toggleFullscreen();
          } else if (deltaY > 50 && document.fullscreenElement) {
            document.exitFullscreen?.();
          }
        }
        return;
      }

      // tap (or double-tap) detected
      const now = Date.now();
      const side: 'left' | 'right' = end.clientX >= cRect.left + cRect.width / 2 ? 'right' : 'left';
      const dir = side === 'right' ? 1 : -1;
      const last = lastTapRef.current;
      lastTapRef.current = { time: now, side };
      suppressClickRef.current = true;

      // Cancela o play/pause agendado (single tap) quando vier o 2º toque
      if (playTimerRef.current) { clearTimeout(playTimerRef.current); playTimerRef.current = null; }

      const acc = tapAccumRef.current;
      if (acc.timer) clearTimeout(acc.timer);

      if (last && side === last.side && now - last.time < 350) {
        // toque repetido no mesmo lado → acumula (3 toques = 20s, 4 = 30s...)
        acc.side = side;
        acc.count += 1;
        const delta = (acc.count - 1) * 10 * dir;
        setSkipFeedback({ delta, id: Date.now() });
        acc.timer = setTimeout(() => {
          acc.timer = null;
          acc.count = 0;
          skip(delta);
          setSkipFeedback(null);
        }, 450);
      } else {
        // primeiro toque da sequência: single tap → play/pause (cancelável)
        acc.side = side;
        acc.count = 1;
        acc.timer = setTimeout(() => {
          acc.timer = null;
          acc.count = 0;
        }, 350);
        playTimerRef.current = setTimeout(() => {
          playTimerRef.current = null;
          togglePlay();
        }, 350);
      }
    };

    c.addEventListener('touchstart', onTouchStart, { passive: true });
    c.addEventListener('touchmove', onTouchMove, { passive: true });
    c.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      c.removeEventListener('touchstart', onTouchStart);
      c.removeEventListener('touchmove', onTouchMove);
      c.removeEventListener('touchend', onTouchEnd);
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      if (tapAccumRef.current.timer) clearTimeout(tapAccumRef.current.timer);
      if (swipeFeedbackTimerRef.current) clearTimeout(swipeFeedbackTimerRef.current);
    };
  }, [toggleFullscreen, togglePlay, skip, changeVolume, changeBrightness, volume, brightness]);

  // Cleanup hover thumbnail timer on unmount
  useEffect(() => {
    return () => {
      if (hoverThumbTimerRef.current) clearTimeout(hoverThumbTimerRef.current);
    };
  }, []);

  const formatTime = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return '--:--';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  };

  // Continuous hover tracking on the progress bar — updates hoverTime on every
  // mousemove and refetches the preview frame as the cursor advances (threshold
  // 2s to avoid hammering ffmpeg per pixel).
  const handleHoverMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = videoRef.current;
    const newTime = pct * (duration > 0 ? duration : (v && v.duration > 0 && isFinite(v.duration) ? v.duration : (duration || 1)));
    setHoverTime(newTime);
    if (hoverThumbTimerRef.current) clearTimeout(hoverThumbTimerRef.current);
    hoverThumbTimerRef.current = setTimeout(() => {
      const path = extractStreamPath(currentSrc);
      const fetchedAt = hoverFetchTimeRef.current;
      if (path && (path !== hoverPathRef.current || Math.abs(newTime - fetchedAt) >= 2)) {
        hoverPathRef.current = path;
        hoverFetchTimeRef.current = newTime;
        const token = localStorage.getItem('media_token') || '';
        const frameUrl = `${MEDIA_API}/stream/frame?path=${encodeURIComponent(path)}&time=${Math.floor(newTime)}&token=${encodeURIComponent(token)}`;
        const img = new Image();
        img.onload = () => setHoverThumbnail(frameUrl);
        img.onerror = () => setHoverThumbnail(null);
        img.src = frameUrl;
      }
    }, 150);
  }, [currentSrc, duration]);

  if (error) {
    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-white font-medium">{error}</p>
          <p className="text-gray-400 text-sm mt-1">{title}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              if (videoRef.current) {
                videoRef.current.load();
              }
            }}
            className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
          >
            {t('videoPlayer.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden group"
      style={{ overflow: 'hidden', touchAction: 'manipulation' }}
      onMouseMove={showControlsTemporarily}
      onClick={() => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        togglePlay();
      }}
    >
      {/* Feedback de brilho/volume durante swipe */}
      {showBrightnessBar && (
        <div className="absolute top-1/2 left-3 -translate-y-1/2 flex flex-col items-center gap-1 bg-black/60 rounded-full px-2 py-3 pointer-events-none">
          <Sun className="w-5 h-5 text-white" />
          <div className="w-1 h-8 bg-white/30 rounded-full overflow-hidden">
            <div className="w-full bg-white rounded-full transition-all" style={{ height: `${brightness * 100}%`, marginTop: 'auto' }} />
          </div>
        </div>
      )}
      {showVolumeBar && (
        <div className="absolute top-1/2 right-3 -translate-y-1/2 flex flex-col items-center gap-1 bg-black/60 rounded-full px-2 py-3 pointer-events-none">
          {volume === 0 || muted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume1 className="w-5 h-5 text-white" />}
          <div className="w-1 h-8 bg-white/30 rounded-full overflow-hidden">
            <div className="w-full bg-white rounded-full transition-all" style={{ height: `${((muted || volume === 0) ? 0 : volume) * 100}%`, marginTop: 'auto' }} />
          </div>
        </div>
      )}
      {/* Vídeo */}
      <video
        ref={videoRef}
        poster={poster}
        className="w-full h-full object-contain"
        preload="auto"
        playsInline
        autoPlay
        crossOrigin="anonymous"
        x-webkit-airplay="allow"
        data-remote="true"
      />

      {/* Loading overlay */}
       {loading && (
         <div className="absolute inset-0 flex items-center justify-center bg-black/50">
           <Loader2 className="w-10 h-10 text-white animate-spin" />
         </div>
       )}

      {/* Feedback visual do duplo toque (seek ±10s/20s/30s) */}
      {skipFeedback !== null && (
        <div key={skipFeedback.id} className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="animate-seek-pop flex items-center gap-1.5 rounded-full bg-black/50 px-4 py-2.5 backdrop-blur-sm">
            {skipFeedback.delta > 0
              ? <Redo2 className="w-7 h-7 text-white" />
              : <Undo2 className="w-7 h-7 text-white" />}
            <span className="text-white font-semibold text-xl tabular-nums">
              {skipFeedback.delta > 0 ? `+${skipFeedback.delta}` : skipFeedback.delta}s
            </span>
          </div>
        </div>
      )}

{/* Play overlay central */}
      {!playing && !loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors cursor-pointer">
            <Play className="w-8 h-8 text-white ml-1" />
          </div>
        </div>
      )}

      {/* Barra de controles */}
      <div
        data-controls=""
        className={cn(
          'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent',
          'px-4 pb-3 pt-10 transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="relative w-full cursor-pointer group/progress mb-3"
          data-progress=""
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') return;
            e.stopPropagation();
            scrubbingRef.current = true;
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const v = videoRef.current;
            const total = duration > 0 ? duration : (v && v.duration > 0 && isFinite(v.duration) ? v.duration : (duration || 1));
            const t = pct * total;
            setCurrentTime(t);
            setHoverTime(t);
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'touch') return;
            if (!scrubbingRef.current) return;
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const v = videoRef.current;
            const total = duration > 0 ? duration : (v && v.duration > 0 && isFinite(v.duration) ? v.duration : (duration || 1));
            const t = pct * total;
            setCurrentTime(t);
            setHoverTime(t);
          }}
          onPointerUp={(e) => {
            if (e.pointerType === 'touch') return;
            if (!scrubbingRef.current) return;
            scrubbingRef.current = false;
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const v = videoRef.current;
            const total = duration > 0 ? duration : (v && v.duration > 0 && isFinite(v.duration) ? v.duration : (duration || 1));
            // Seek único no release (debounce) — evita múltiplos reloads de
            // transcode que dessincronizam áudio/vídeo.
            seek(pct * total);
          }}
          onPointerCancel={() => { scrubbingRef.current = false; }}
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
            e.stopPropagation();
            isTouchScrubRef.current = true;
            scrubbingRef.current = true;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
            const v = videoRef.current;
            const total = duration > 0 ? duration : (v && v.duration > 0 && isFinite(v.duration) ? v.duration : (duration || 1));
            const t = pct * total;
            setCurrentTime(t);
            setHoverTime(t);
          }}
          onTouchMove={(e) => {
            if (!isTouchScrubRef.current || e.touches.length !== 1) return;
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
            const v = videoRef.current;
            const total = duration > 0 ? duration : (v && v.duration > 0 && isFinite(v.duration) ? v.duration : (duration || 1));
            const t = pct * total;
            setCurrentTime(t);
            setHoverTime(t);
            setHoverThumbnail(null);
            if (hoverThumbTimerRef.current) clearTimeout(hoverThumbTimerRef.current);
          }}
          onTouchEnd={(e) => {
            if (!isTouchScrubRef.current) return;
            isTouchScrubRef.current = false;
            scrubbingRef.current = false;
            e.stopPropagation();
            const changed = e.changedTouches[0];
            if (changed) {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (changed.clientX - rect.left) / rect.width));
              const v = videoRef.current;
              const total = duration > 0 ? duration : (v && v.duration > 0 && isFinite(v.duration) ? v.duration : (duration || 1));
              seek(pct * total);
            }
            setHoverTime(null);
            setHoverThumbnail(null);
            hoverPathRef.current = '';
            hoverFetchTimeRef.current = -1;
          }}
          onMouseMove={handleHoverMove}
          onMouseEnter={handleHoverMove}
          onMouseLeave={() => {
            if (scrubbingRef.current) return;
            setHoverTime(null);
            setHoverThumbnail(null);
            hoverPathRef.current = '';
            hoverFetchTimeRef.current = -1;
            if (hoverThumbTimerRef.current) clearTimeout(hoverThumbTimerRef.current);
          }}
        >
          {/* Invisible larger hit area */}
          <div className="absolute inset-x-0 -top-2 -bottom-2" />
          {/* Buffered bar (background) */}
          <div className="absolute inset-0 h-2 bg-white/10 rounded-full">
            {bufferedEnd > 0 && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 bg-white/30 rounded-full"
                style={{ left: '0%', width: `${(bufferedEnd / duration) * 100}%` }}
              />
            )}
          </div>
          {/* Visible bar */}
          <div className="relative w-full h-2 bg-white/20 rounded-full group-hover/progress:h-3 transition-all">
            <div
              className="absolute inset-y-0 left-0 bg-sky-500 rounded-full transition-all"
              style={{ width: `${duration && isFinite(duration) ? (currentTime / duration) * 100 : 0}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-sky-500 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-lg"
              style={{ left: `${duration && isFinite(duration) ? (currentTime / duration) * 100 : 0}%`, marginLeft: '-8px' }}
            />
          </div>
          {/* Hover time tooltip with thumbnail */}
          {hoverTime !== null && (
            <div
              className="absolute bottom-full left-0 mb-2 transform -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${duration && isFinite(duration) ? (hoverTime / duration) * 100 : 0}%` }}
            >
              {hoverThumbnail && (
                <div className="relative mb-1 rounded-lg overflow-hidden shadow-xl border border-white/10">
                  <img
                    src={hoverThumbnail}
                    alt=""
                    className="w-40 h-24 object-cover block"
                  />
                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                    {formatTime(hoverTime)}
                  </div>
                </div>
              )}
              <div className="text-xs bg-black/80 text-white rounded px-1.5 py-0.5">
                {formatTime(hoverTime)}
              </div>
            </div>
          )}
        </div>

         <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {/* Prev */}
            {hasPrev && onPrev && (
              <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="p-1.5 text-white/70 hover:text-white transition-colors" title={t('videoPlayer.previous')}>
                <ChevronsLeft className="w-5 h-5" />
              </button>
            )}
            {/* Play/Pause */}
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="p-1.5 text-white hover:text-sky-400 transition-colors">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>

            {/* Skip -10s */}
            <button onClick={(e) => { e.stopPropagation(); skip(-10); }} className="p-1.5 text-white/70 hover:text-white transition-colors">
              <SkipBack className="w-4 h-4" />
            </button>

            {/* Skip +10s */}
            <button onClick={(e) => { e.stopPropagation(); skip(10); }} className="p-1.5 text-white/70 hover:text-white transition-colors">
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Next */}
            {hasNext && onNext && (
              <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="p-1.5 text-white/70 hover:text-white transition-colors" title={t('videoPlayer.next')}>
                <ChevronsRight className="w-5 h-5" />
              </button>
            )}

            {/* Volume */}
            <div className="flex items-center gap-1.5 group/vol">
              <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="p-1.5 text-white/70 hover:text-white transition-colors">
                {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => { e.stopPropagation(); changeVolume(parseFloat(e.target.value)); }}
                className="w-0 group-hover/vol:w-20 transition-all accent-sky-500 h-1 opacity-0 group-hover/vol:opacity-100"
              />
            </div>

            {/* Time */}
            <span className="text-xs text-gray-300 ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Subtitles toggle */}
            {subtitles.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); onSubtitleToggle?.(!subtitleActive); }}
                className={cn('p-1.5 transition-colors', subtitleActive ? 'text-sky-400 hover:text-sky-300' : 'text-white/70 hover:text-white')}
                title={t('videoPlayer.subtitles')}
              >
                <Subtitles className="w-4 h-4" />
              </button>
            )}

            {/* Speed */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
                const idx = speeds.indexOf(speed);
                const next = speeds[(idx + 1) % speeds.length];
                onSpeedChange?.(next);
                if (videoRef.current) videoRef.current.playbackRate = next;
              }}
              className="p-1.5 text-white/70 hover:text-white transition-colors text-xs font-mono min-w-[28px] text-center"
              title={t('videoPlayer.playbackSpeed')}
            >
              {speed}x
            </button>

            {/* Dispositivos (Chromecast / Smart TV / AirPlay / DLNA) */}
            <DevicePicker
              src={currentSrc}
              title={title}
              mediaId={mediaId}
              mediaType={mediaType}
              poster={poster}
              currentTime={currentTime}
              videoRef={videoRef}
              onCastStart={(deviceName) => {
                // Pausar vídeo local
                const v = videoRef.current;
                if (v && !v.paused) {
                  v.pause();
                  setPlaying(false);
                }
                // Salvar posição atual para possível retomada
                localStorage.setItem('lastCastPosition', currentTime.toString());
                toast.success('Transmitindo', `Para ${deviceName}`);
              }}
            />

            {/* Fullscreen */}
            <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="p-1.5 text-white/70 hover:text-white transition-colors">
              {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Title overlay (top) */}
      {title && showControls && (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent px-4 py-3 flex items-center gap-3">
          {onBack && (
            <button
              onClick={(e) => { e.stopPropagation(); onBack(); }}
              className="p-1.5 text-white/70 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <p className="text-sm text-white font-medium truncate">{title}</p>
        </div>
      )}

      {/* Auto-play countdown overlay — only visible when the timer is actually running */}
      {countdown !== null && countdown > 0 && (
        <div className="absolute top-20 right-4 bg-black/70 rounded-lg px-3 py-2 text-white text-sm z-20">
          Próximo em {countdown}s
        </div>
      )}
    </div>
  );
}
