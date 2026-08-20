// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { cn } from '@/lib/utils';
import { AdBanner } from '@/components/AdBanner';
import { AdSenseBanner } from '@/components/AdSenseBanner';
import BackButton from '@/components/BackButton';
import { useHierarchicalBackspace } from '@/hooks/useHierarchicalBackspace';

interface ToolPageLayoutProps {
  children: React.ReactNode;
  onBack?: () => void;
  backTo?: string;
  hideBack?: boolean;
  className?: string;
}

export default function ToolPageLayout({
  children,
  onBack,
  backTo = '/',
  hideBack = false,
  className,
}: ToolPageLayoutProps) {
  useHierarchicalBackspace({ onBack });

  return (
    <div className="w-full max-w-full overflow-x-hidden min-h-screen bg-[#0D1117] text-white pt-16 md:pt-20">
      {/* Background grid */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:6rem_6rem]" />
      </div>

      {/* Sidebar Esquerda (fixa, oculta no mobile) */}
      <aside className="hidden md:block fixed left-0 top-20 z-50">
        <AdSenseBanner
          adClient="ca-pub-7405286854348669"
          adSlot="1234567890"
          format="vertical"
          width={120}
          height={600}
          className="w-full"
        />
      </aside>

      {/* Sidebar Direita (fixa, oculta no mobile) */}
      <aside className="hidden md:block fixed right-0 top-20 z-50">
        <AdSenseBanner
          adClient="ca-pub-7405286854348669"
          adSlot="1234567891"
          format="vertical"
          width={120}
          height={600}
          className="w-full"
        />
      </aside>

      {/* Conteúdo principal com sticky footer */}
      <div className="relative z-10 flex flex-col min-h-[calc(100vh-5rem)]">
        {/* Botão Voltar */}
        {!hideBack && (
          <div className="sticky top-16 md:top-20 z-40 bg-[#0D1117]/95 backdrop-blur-md border-b border-white/5">
            <div className="w-full max-w-5xl mx-auto px-4 md:px-[140px] py-3">
              <BackButton onBack={onBack} fallbackTo={backTo} />
            </div>
          </div>
        )}

        {/* Conteúdo principal (cresce para ocupar espaço) */}
        <main className={cn('flex-1 w-full max-w-5xl mx-auto px-4 md:px-[140px] py-6', className)}>
          {children}
        </main>

        {/* Rodapé de Anúncio (sticky footer) */}
        <div className="w-full flex justify-center mt-auto mb-8 px-4">
          <AdBanner variant="leaderboard" />
        </div>
      </div>
    </div>
  );
}
