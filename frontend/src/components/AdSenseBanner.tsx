// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export type AdFormat = 'auto' | 'rectangle' | 'vertical' | 'horizontal' | 'leaderboard';

interface AdSenseBannerProps {
  /** ID do cliente AdSense (ex: 'ca-pub-7405286854348669') */
  adClient: string;
  /** ID do bloco de anúncio (data-ad-slot) */
  adSlot: string;
  /** Formato do anúncio (padrão 'auto') */
  format?: AdFormat;
  /** Classe CSS adicional */
  className?: string;
  /** Largura fixa (opcional, para formatos específicos) */
  width?: number;
  /** Altura fixa (opcional, para formatos específicos) */
  height?: number;
}

/**
 * AdSenseBanner – Componente seguro para Google AdSense.
 *
 * - Inicializa o anúncio via (window.adsbygoogle = window.adsbygoogle || []).push({})
 * - Evita renderização dupla com ref de controle
 * - Exibe skeleton elegante enquanto o anúncio não carrega
 * - Aceita props: adClient, adSlot, format, width, height
 *
 * Uso:
 *   <AdSenseBanner
 *     adClient="ca-pub-7405286854348669"
 *     adSlot="1234567890"
 *     format="rectangle"
 *   />
 */
export function AdSenseBanner({
  adClient,
  adSlot,
  format = 'auto',
  className,
  width,
  height,
}: AdSenseBannerProps) {
  const initializedRef = useRef(false);
  const insRef = useRef<HTMLModElement>(null);

  // ─── Dimensões do skeleton conforme formato ───────────────
  const skeletonDimensions = (() => {
    switch (format) {
      case 'leaderboard':
        return { w: width || 728, h: height || 90 };
      case 'rectangle':
        return { w: width || 300, h: height || 250 };
      case 'vertical':
        return { w: width || 160, h: height || 600 };
      case 'horizontal':
        return { w: width || 728, h: height || 90 };
      default:
        return { w: width || 300, h: height || 250 };
    }
  })();

  useEffect(() => {
    // Evita inicializar duas vezes (React StrictMode)
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Pequeno timeout para garantir que o DOM do ins esteja montado
    const timer = setTimeout(() => {
      try {
        ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle = (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle || []).push({});
      } catch (e) {
        // Erro silencioso em dev / quando AdBlock está ativo

      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl',
        'flex items-center justify-center mx-auto',
        className
      )}
      style={{
        minWidth: skeletonDimensions.w,
        minHeight: skeletonDimensions.h,
      }}
    >
      {/* Skeleton / Placeholder (fica atrás do anúncio real) */}
      <div
        className={cn(
          'absolute inset-0 rounded-2xl border-2 border-dashed border-white/10',
          'bg-white/[0.02] flex flex-col items-center justify-center',
          'transition-opacity duration-500',
          'z-0'
        )}
      >
        {/* Grade sutil */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:20px_20px]" />

        {/* Texto central */}
        <div className="relative z-10 flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/20">
            Anúncio Patrocinado
          </span>
          <span className="text-xs text-white/10">
            {skeletonDimensions.w} × {skeletonDimensions.h}
          </span>
        </div>

        {/* Cantos decorativos */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t border-l border-white/5 rounded-tl" />
        <div className="absolute top-2 right-2 w-4 h-4 border-t border-r border-white/5 rounded-tr" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b border-l border-white/5 rounded-bl" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b border-r border-white/5 rounded-br" />
      </div>

      {/* Anúncio real do AdSense */}
      <ins
        ref={insRef}
        className={cn(
          'adsbygoogle',
          'relative z-10',
          'block'
        )}
        data-ad-client={adClient}
        data-ad-slot={adSlot}
        data-ad-format={format}
        data-full-width-responsive="true"
        style={{
          display: 'block',
          minWidth: skeletonDimensions.w,
          minHeight: skeletonDimensions.h,
        }}
      />
    </div>
  );
}
