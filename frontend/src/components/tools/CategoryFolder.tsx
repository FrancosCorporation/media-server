// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { cn } from '@/lib/utils';
import { FolderOpen } from 'lucide-react';

interface CategoryFolderProps {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: { bg: string; border: string; text: string };
  toolCount: number;
  hasNew?: boolean;
  onOpen: (id: string) => void;
}

export default function CategoryFolder({
  id,
  label,
  description,
  icon,
  color,
  toolCount,
  hasNew,
  onOpen,
}: CategoryFolderProps) {
  return (
    <button
      onClick={() => onOpen(id)}
      className={cn(
        'group relative w-full text-left rounded-2xl border transition-all duration-300',
        'p-4 sm:p-5 md:p-6',
        'hover:scale-[1.02] active:scale-[0.98]',
        color.bg,
        color.border,
        'bg-white/[0.02] hover:bg-white/[0.06]'
      )}
      aria-label={`Abrir pasta ${label} com ${toolCount} ferramentas`}
    >
      {hasNew && (
        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-md bg-primary/20 border border-primary/30 text-primary-light text-[10px] font-bold leading-none z-10">
          NOVO
        </span>
      )}

      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <FolderOpen className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4', color.text)} />
      </div>

      <div className={cn(
        'rounded-2xl flex items-center justify-center mb-3 sm:mb-4 md:mb-5 border-2 transition-all duration-300',
        'w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14',
        color.bg,
        color.border,
        'group-hover:scale-110 group-hover:shadow-lg'
      )}>
        <div className={cn('w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7', color.text)}>
          {icon}
        </div>
      </div>

      <h3 className={cn(
        'font-bold mb-1.5 sm:mb-2 transition-colors duration-300',
        'text-base sm:text-lg',
        'text-[var(--wcag-text-primary)]'
      )}>
        {label}
      </h3>

      <p className="text-xs sm:text-sm text-[var(--wcag-text-tertiary)] leading-relaxed mb-3 sm:mb-4 line-clamp-2">
        {description}
      </p>

      <div className={cn(
        'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium transition-all duration-300',
        color.bg,
        color.text
      )}>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse group-hover:animate-none" />
        {toolCount} {toolCount === 1 ? 'ferramenta' : 'ferramentas'}
      </div>

      <div className={cn(
        'absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none',
        'bg-gradient-to-br from-transparent via-transparent to-white/[0.02]'
      )} />
    </button>
  );
}
