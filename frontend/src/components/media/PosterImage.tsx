// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { mediaApiBase } from '@/services/media/api';
import { Film, Loader2 } from 'lucide-react';

interface PosterImageProps {
  src?: string;
  fallbackSrc?: string;
  mediaId?: string;
  tmdbId?: number;
  mediaType?: 'movie' | 'series';
  title?: string;
  alt: string;
  className?: string;
  containerClassName?: string;
}

export default function PosterImage({ src, fallbackSrc, mediaId, tmdbId, mediaType, title, alt, className, containerClassName }: PosterImageProps) {
  const isValidMongoId = useMemo(() => mediaId && /^[a-f0-9]{24}$/i.test(mediaId), [mediaId]);
  const validMediaId = isValidMongoId ? mediaId : undefined;
  const validTmdbId = useMemo(() => tmdbId && Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : undefined, [tmdbId]);

  const fallbackChain = useMemo(() => {
    const chain: string[] = [];
    const add = (url?: string) => {
      if (url && url.trim() !== '' && !chain.includes(url)) chain.push(url);
    };
    const altType = mediaType === 'movie' ? 'series' : mediaType === 'series' ? 'movie' : undefined;
    add(src);
    add(fallbackSrc);
    if (validMediaId && mediaType) {
      add(`${mediaApiBase}/poster/${mediaType}/${validMediaId}`);
      if (altType) add(`${mediaApiBase}/poster/${altType}/${validMediaId}`);
    }
    if (validTmdbId && mediaType) {
      add(`${mediaApiBase}/poster/${mediaType}/${validTmdbId}`);
      if (altType) add(`${mediaApiBase}/poster/${altType}/${validTmdbId}`);
    }
    // Final fallback: title-based TMDB search (try both types)
    if (title && mediaType) {
      const cleanTitle = title
        .replace(/[._-]/g, ' ')
        .replace(/\b(WEB.?DL|BRRip|BDRip|HDRip|DVDRip|HDTV|WEBRip|BluRay|Remux|x264|x265|HEVC|AAC|DD5\.1|DTS|720p|1080p|2160p|4K|HDR|WEB.?DL|WEBDL)\b/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanTitle) {
        add(`${mediaApiBase}/poster/search/${mediaType}/${encodeURIComponent(cleanTitle)}`);
        if (altType) add(`${mediaApiBase}/poster/search/${altType}/${encodeURIComponent(cleanTitle)}`);
      }
    }
    return chain;
  }, [src, fallbackSrc, validMediaId, validTmdbId, mediaType, title]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(fallbackChain.length > 0 ? 'loading' : 'error');
  const imgRef = useRef<HTMLImageElement>(null);
  const prevChainRef = useRef(fallbackChain.join('|'));
  const triedFallbacksRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (fallbackChain.join('|') !== prevChainRef.current) {
      prevChainRef.current = fallbackChain.join('|');
      setCurrentIndex(0);
      setState(fallbackChain.length > 0 ? 'loading' : 'error');
      triedFallbacksRef.current.clear();
    }
  }, [fallbackChain]);

  const currentSrc = fallbackChain[currentIndex];

  const handleLoad = () => setState('loaded');

  const handleError = () => {
    const isPosterFallback = currentSrc?.includes('/media-api/poster/');
    const isLastFallback = currentIndex >= fallbackChain.length - 1;
    
    triedFallbacksRef.current.add(currentSrc || '');
    
    if (isPosterFallback) {
      console.debug(`[PosterImage] TMDB poster fallback 404: ${currentSrc}`);
    } else if (isLastFallback) {
      console.warn(`[PosterImage] Failed to load image (no more fallbacks): ${currentSrc}`);
    } else {
      console.debug(`[PosterImage] Image failed, trying next fallback: ${currentSrc}`);
    }

    if (currentIndex < fallbackChain.length - 1) {
      setCurrentIndex(i => i + 1);
      setState('loading');
      return;
    }
    setState('error');
  };

  if (!currentSrc || state === 'error') {
    return (
      <div className={cn('flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 gap-2', containerClassName)}>
        <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center">
          <Film className="w-7 h-7 text-gray-500" />
        </div>
        {alt && <span className="text-[10px] text-gray-500 px-3 text-center leading-tight line-clamp-2">{alt}</span>}
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden', containerClassName)}>
      {(state === 'idle' || state === 'loading') && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800/50 z-10">
          <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
        </div>
      )}
      <img
        key={currentSrc}
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        className={cn(
          'w-full h-full object-cover transition-opacity duration-300',
          state === 'loaded' ? 'opacity-100' : 'opacity-0',
          className
        )}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}
