// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdBanner } from '@/components/AdBanner';
import ToolCard from './ToolCard';

interface CategoryInfo {
  id: string;
  label: string;
  color: { bg: string; border: string; text: string };
  icon?: React.ReactNode;
}

interface ToolDef {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  categoryLabel: string;
  categoryColor: { bg: string; border: string; text: string };
  isNew?: boolean;
}

interface CategoryModalProps {
  category: CategoryInfo;
  tools: ToolDef[];
  onClose: () => void;
  onOpenTool: (id: string) => void;
}

export default function CategoryModal({
  category,
  tools,
  onClose,
  onOpenTool,
}: CategoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return tools;
    const q = searchQuery.toLowerCase();
    return tools.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [tools, searchQuery]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header with back button */}
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <button
          onClick={onClose}
          className={cn(
            'p-2.5 rounded-xl transition-all duration-200',
            'hover:bg-white/[0.07] active:scale-95',
            'text-[var(--wcag-text-tertiary)] hover:text-[var(--wcag-text-primary)]'
          )}
          aria-label="Voltar para categorias"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className={cn(
          'w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center border-2 shrink-0',
          category.color.bg,
          category.color.border
        )}>
          {category.icon ? (
            <div className={cn('w-5 h-5 md:w-6 md:h-6', category.color.text)}>
              {category.icon}
            </div>
          ) : (
            <div className={cn('w-5 h-5 md:w-6 md:h-6 rounded-full bg-current opacity-20', category.color.text)} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className={cn(
            'text-xl md:text-2xl font-bold truncate',
            'text-[var(--wcag-text-primary)]'
          )}>
            {category.label}
          </h2>
          <p className={cn(
            'text-sm truncate',
            'text-[var(--wcag-text-tertiary)]'
          )}>
            {tools.length} {tools.length === 1 ? 'ferramenta disponível' : 'ferramentas disponíveis'}
          </p>
        </div>

        <button
          onClick={onClose}
          className={cn(
            'p-2.5 rounded-xl transition-all duration-200',
            'hover:bg-white/[0.07] active:scale-95',
            'text-[var(--wcag-text-tertiary)] hover:text-[var(--wcag-text-primary)]'
          )}
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      

      {/* Tools grid */}
      {filteredTools.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {filteredTools.map((tool) => (
            <ToolCard
              key={tool.id}
              id={tool.id}
              title={tool.title}
              description={tool.description}
              icon={tool.icon}
              categoryColor={tool.categoryColor}
              categoryLabel={tool.categoryLabel}
              isNew={tool.isNew}
              onClick={onOpenTool}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className={cn(
            'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4',
            category.color.bg
          )}>
            <Search className={cn('w-6 h-6', category.color.text)} />
          </div>
          <p className="text-[var(--wcag-text-secondary)] text-lg mb-2">
            Nenhuma ferramenta encontrada
          </p>
          <p className="text-[var(--wcag-text-tertiary)] text-sm">
            Tente buscar por outro termo
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className={cn(
              'mt-4 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              'text-primary-light hover:text-primary-light/80',
              'hover:bg-primary/10'
            )}
          >
            Limpar busca
          </button>
        </div>
      )}

      {/* Tool count summary */}
      <div className="mt-6 text-center">
        <p className={cn(
          'text-xs',
          'text-[var(--wcag-text-placeholder)]'
        )}>
          Mostrando {filteredTools.length} de {tools.length} ferramentas
          {searchQuery && ` • "${searchQuery}"`}
        </p>
      </div>

      {/* Footer ad */}
      <div className="w-full flex justify-center mt-12 mb-4">
        <AdBanner variant="leaderboard" />
      </div>
    </div>
  );
}
