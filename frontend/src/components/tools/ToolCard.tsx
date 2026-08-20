// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { cn } from '@/lib/utils';

interface ToolCardProps {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  categoryColor: { bg: string; border: string; text: string };
  categoryLabel: string;
  isNew?: boolean;
  onClick: (id: string) => void;
}

export default function ToolCard({ id, title, description, icon, categoryColor, categoryLabel, isNew, onClick }: ToolCardProps) {
  return (
    <button
      onClick={() => onClick(id)}
      className={cn(
        'group relative text-left rounded-2xl border p-5 transition-all duration-300',
        'hover:scale-[1.02] active:scale-[0.98]',
        'border-white/[0.06] bg-white/[0.03]',
        'hover:border-white/[0.12] hover:bg-white/[0.05]'
      )}
      aria-label={`${title} - ${categoryLabel}`}
    >
      {isNew && (
        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-md bg-primary/20 border border-primary/30 text-primary-light text-[10px] font-bold leading-none z-10">
          NOVO
        </span>
      )}
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center mb-4 border', categoryColor.bg, categoryColor.border)}>
        {icon}
      </div>
      <h3 className={cn(
        'text-sm font-semibold mb-1.5 transition-all duration-300',
        'text-[var(--wcag-text-primary)]',
        'group-hover:text-gradient-violet'
      )}>
        {title}
      </h3>
      <p className={cn(
        'text-xs leading-relaxed line-clamp-2',
        'text-[var(--wcag-text-tertiary)]'
      )}>
        {description}
      </p>
      <span className={cn('inline-block mt-3 px-2 py-0.5 rounded-md text-[10px] font-medium', categoryColor.bg, categoryColor.text)}>
        {categoryLabel}
      </span>
    </button>
  );
}
