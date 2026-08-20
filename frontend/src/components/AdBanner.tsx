// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { cn } from '@/lib/utils';

interface AdBannerProps {
  variant?: 'leaderboard' | 'rectangle';
  className?: string;
}

/**
 * AdBanner – Espaço estratégico para anúncios (monetização futura).
 *
 * Variants:
 * - leaderboard (728×90) → banner horizontal longo
 * - rectangle    (300×250) → banner retangular
 */
export function AdBanner({ variant = 'leaderboard', className }: AdBannerProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border-2 border-dashed border-white/10',
        'bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300',
        'flex items-center justify-center select-none mx-auto',
        variant === 'leaderboard'
          ? 'w-full max-w-[728px] h-[90px]'
          : 'w-full max-w-[300px] h-[250px]',
        className
      )}
      role="complementary"
      aria-label="Espaço publicitário"
    >
      {/* Grade sutil ao fundo */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:20px_20px]" />

      {/* Conteúdo central */}
      <div className="relative z-10 flex flex-col items-center gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/20">
          Anúncio patrocinado
        </span>
        <span className="text-xs text-white/10">
          {variant === 'leaderboard' ? '728 × 90' : '300 × 250'}
        </span>
      </div>

      {/* Cantos decorativos */}
      <div className="absolute top-2 left-2 w-4 h-4 border-t border-l border-white/5 rounded-tl" />
      <div className="absolute top-2 right-2 w-4 h-4 border-t border-r border-white/5 rounded-tr" />
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b border-l border-white/5 rounded-bl" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b border-r border-white/5 rounded-br" />
    </div>
  );
}
