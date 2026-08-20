// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import ToolPageLayout from './ToolPageLayout';

interface ToolLayoutProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  categoryLabel: string;
  categoryColor: { bg: string; border: string; text: string };
  onBack: () => void;
  children: React.ReactNode;
}

export default function ToolLayout({
  title,
  description,
  icon,
  categoryLabel,
  categoryColor,
  onBack,
  children,
}: ToolLayoutProps) {
  return (
    <ToolPageLayout onBack={onBack}>
      {/* Header da ferramenta */}
      <div className="flex items-center gap-3 md:gap-4 mb-8">
        <div className={cn('w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center border shrink-0', categoryColor.bg, categoryColor.border)}>
          <div className="w-5 h-5 md:w-6 md:h-6">{icon}</div>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base md:text-xl font-semibold text-white truncate">{title}</h1>
          <p className="text-xs md:text-sm text-[#A1A1AA] truncate">{description}</p>
        </div>
        <span className={cn('px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-[10px] md:text-xs font-medium shrink-0 whitespace-nowrap', categoryColor.bg, categoryColor.border, categoryColor.text)}>
          {categoryLabel}
        </span>
      </div>

      {/* Conteúdo scrollável */}
      <Suspense fallback={
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" variant="violet" label="Carregando ferramenta..." />
        </div>
      }>
        {children}
      </Suspense>
    </ToolPageLayout>
  );
}
