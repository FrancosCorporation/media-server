// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
  'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
  'consequat', 'duis', 'aute', 'irure', 'dolor', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'eu', 'fugiat', 'nulla', 'pariatur', 'excepteur',
  'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
  'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum',
];

function randomWord(): string {
  return LOREM_WORDS[Math.floor(Math.random() * LOREM_WORDS.length)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generateSentence(): string {
  const len = 6 + Math.floor(Math.random() * 10);
  const words = Array.from({ length: len }, () => randomWord());
  return capitalize(words.join(' ')) + '.';
}

function generateParagraph(sentences: number): string {
  return Array.from({ length: sentences }, () => generateSentence()).join(' ');
}

export default function LoremIpsum({ onBack: _onBack }: ToolProps) {
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState<'paragraphs' | 'words' | 'sentences'>('paragraphs');
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = useCallback(() => {
    switch (mode) {
      case 'paragraphs': {
        setText(Array.from({ length: count }, () => generateParagraph(5)).join('\n\n'));
        break;
      }
      case 'sentences': {
        setText(Array.from({ length: count }, () => generateSentence()).join(' '));
        break;
      }
      case 'words': {
        setText(Array.from({ length: count }, () => randomWord()).join(' '));
        break;
      }
    }
  }, [count, mode]);

  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
          className="w-20 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50"
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          className={cn(
            'px-3 py-2 rounded-xl text-sm outline-none transition-all duration-200 appearance-none',
            'bg-white/[0.06] border border-white/[0.12]',
            'text-[var(--wcag-text-primary)]',
            'focus:border-primary/50 focus:ring-2 focus:ring-primary/20'
          )}
          style={{
            // Garante contraste no dropdown nativo do browser
            colorScheme: 'dark',
            WebkitAppearance: 'menulist-button',
          }}
        >
          <option value="paragraphs" className="bg-[#1A1D24] text-[var(--wcag-text-primary)]">Parágrafos</option>
          <option value="sentences" className="bg-[#1A1D24] text-[var(--wcag-text-primary)]">Frases</option>
          <option value="words" className="bg-[#1A1D24] text-[var(--wcag-text-primary)]">Palavras</option>
        </select>
        <button onClick={generate} className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Gerar
        </button>
      </div>

      {text && (
        <>
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 text-sm text-[#A1A1AA] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
            {text}
          </div>
          <button onClick={handleCopy} className={cn('px-4 py-2 rounded-xl text-sm font-medium border transition-all flex items-center gap-2', copied ? 'border-green-500/30 text-green-400' : 'border-white/10 text-[#A1A1AA] hover:bg-white/5 hover:text-white')}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar Texto'}
          </button>
        </>
      )}
    </div>
  );
}
