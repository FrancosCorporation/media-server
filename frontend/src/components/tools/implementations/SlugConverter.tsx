// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SlugConverter({ onBack: _onBack }: ToolProps) {
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);

  const slug = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '')    // Remove special chars
    .trim()
    .replace(/\s+/g, '-')             // Spaces to hyphens
    .replace(/-+/g, '-')              // Remove duplicate hyphens
    .replace(/^-|-$/g, '');           // Remove leading/trailing hyphens

  const handleCopy = async () => {
    if (!slug) return;
    await navigator.clipboard.writeText(slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <label className="text-xs text-[#A1A1AA] mb-1 block">Título ou Texto Original</label>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3}
          placeholder="Ex: Como Criar um Site Incrível em 2026!"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 resize-y" />
      </div>
      <div>
        <label className="text-xs text-[#A1A1AA] mb-1 block">Slug Gerado</label>
        <div className="relative">
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
            <code className="text-lg text-green-300 font-mono break-all">{slug || 'slug-aparecera-aqui'}</code>
          </div>
          {slug && (
            <button onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
      {slug && (
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <p className="text-xs text-[#A1A1AA] mb-1">URL completa sugerida:</p>
          <code className="text-xs text-primary-light/80 font-mono break-all">https://seusite.com/{slug}/</code>
        </div>
      )}
    </div>
  );
}
