// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';

interface SectionBackgroundProps {
  intensity?: 'subtle' | 'medium' | 'strong';
  gridSize?: string;
  className?: string;
  children?: React.ReactNode;
  variant?: 'default' | 'hero' | 'cta' | 'minimal';
}

/**
 * Componente de fundo unificado usando o novo design system.
 * Substitui gradientes hardcoded por variáveis CSS do tema.
 */
export default function SectionBackground({
  intensity = 'subtle',
  gridSize = '6rem',
  className,
  children,
  variant = 'default'
}: SectionBackgroundProps) {
  const opacityMap = {
    subtle: { violet: '0.06', cyan: '0.04', grid: '0.02' },
    medium: { violet: '0.1', cyan: '0.06', grid: '0.025' },
    strong: { violet: '0.15', cyan: '0.1', grid: '0.03' },
  };

  const { violet, cyan, grid } = opacityMap[intensity];

  const positions = {
    default: {
      violet: 'top-[25%] left-[40%]',
      cyan: 'bottom-0 right-0',
    },
    hero: {
      violet: 'top-[-20%] left-[50%] -translate-x-1/2 w-[80vw] h-[60vh]',
      cyan: 'top-[-10%] right-[10%] w-[40vw] h-[40vh]',
    },
    cta: {
      violet: 'top-[25%] left-[40%]',
      cyan: 'bottom-[0] right-[0]',
    },
    minimal: {
      violet: 'top-[25%] left-[40%]',
      cyan: 'bottom-[0] right-[0]',
    }
  };

  const pos = positions[variant];

  return (
    <>
      {/* Violet radial gradient */}
      <div
        className={`absolute ${pos.violet}`}
        style={{
          background: `radial-gradient(ellipse at 50% 30%, hsla(var(--logo-violet), ${violet}) 0%, transparent 60%)`,
        }}
        aria-hidden="true"
      />

      {/* Cyan radial gradient */}
      <div
        className={`absolute ${pos.cyan}`}
        style={{
          background: `radial-gradient(ellipse at 100% 90%, hsla(var(--logo-cyan), ${cyan}) 0%, transparent 50%)`,
        }}
        aria-hidden="true"
      />

      {/* Grid pattern */}
      <div
        className={`absolute inset-0 ${className || ''}`}
        style={{
          opacity: grid,
          backgroundImage: `linear-gradient(hsla(0, 0%, 100%, 0.03) 1px, transparent 1px), linear-gradient(90deg, hsla(0, 0%, 100%, 0.03) 1px, transparent 1px)`,
          backgroundSize: gridSize,
        }}
        aria-hidden="true"
      />

      {/* Dark overlay gradient for text readability */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-transparent via-[hsl(var(--background))/0.6] to-[hsl(var(--background))]"
        aria-hidden="true"
      />

      {children}
    </>
  );
}