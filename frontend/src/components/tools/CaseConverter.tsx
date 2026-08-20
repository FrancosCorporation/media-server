// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { cn } from '@/lib/utils';
import { Copy, Check } from 'lucide-react';

export default function CaseConverter({ onBack: _onBack }: ToolProps) {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  const convert = (type: string) => {
    let result = text;
    switch (type) {
      case 'upper': result = text.toUpperCase(); break;
      case 'lower': result = text.toLowerCase(); break;
      case 'title': result = text.replace(/\b\w/g, (c) => c.toUpperCase()); break;
      case 'sentence': result = text.replace(/(?:^|\.\s+|\?\s+|\!\s+)(\w)/g, (m) => m.toUpperCase()); break;
      case 'invert': result = text.split('').reverse().join(''); break;
    }
    setText(result);
  };

  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Digite ou cole seu texto aqui..."
        rows={8}
        className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all resize-y"
      />
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'upper', label: 'MAIÚSCULAS', color: 'text-blue-400 hover:bg-blue-500/10 border-blue-500/20 hover:border-blue-500/30' },
          { key: 'lower', label: 'minúsculas', color: 'text-green-400 hover:bg-green-500/10 border-green-500/20 hover:border-green-500/30' },
          { key: 'title', label: 'Título Case', color: 'text-purple-400 hover:bg-purple-500/10 border-purple-500/20 hover:border-purple-500/30' },
          { key: 'sentence', label: 'Sentença case', color: 'text-amber-400 hover:bg-amber-500/10 border-amber-500/20 hover:border-amber-500/30' },
          { key: 'invert', label: 'Inverter Texto', color: 'text-pink-400 hover:bg-pink-500/10 border-pink-500/20 hover:border-pink-500/30' },
        ].map((btn) => (
          <button
            key={btn.key}
            onClick={() => convert(btn.key)}
            className={cn('px-4 py-2 rounded-xl text-sm font-medium border transition-all', btn.color, 'bg-white/5')}
          >
            {btn.label}
          </button>
        ))}
        <button
          onClick={handleCopy}
          className="px-4 py-2 rounded-xl text-sm font-medium border border-white/10 text-[#A1A1AA] hover:bg-white/5 hover:text-white transition-all flex items-center gap-2"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
