// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SpaceRemover({ onBack: _onBack }: ToolProps) {
  const [text, setText] = useState('');
  const [trimLines, setTrimLines] = useState(true);
  const [removeBlank, setRemoveBlank] = useState(true);
  const [removeTabs, setRemoveTabs] = useState(true);
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  const handleClean = () => {
    let t = text;
    if (removeTabs) t = t.replace(/\t/g, ' ');
    if (trimLines) t = t.split('\n').map(l => l.trim()).join('\n');
    if (removeBlank) t = t.replace(/^\s*[\r\n]/gm, '\n').replace(/\n{3,}/g, '\n\n');
    t = t.replace(/[ ]{2,}/g, ' ');
    setResult(t.trim());
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
        placeholder="Cole o texto com espaços extras, tabulações ou linhas em branco..."
        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 resize-y" />
      <div className="flex flex-wrap gap-4">
        {[
          { label: 'Remover espaços extras nas linhas', value: trimLines, set: setTrimLines },
          { label: 'Remover linhas em branco duplicadas', value: removeBlank, set: setRemoveBlank },
          { label: 'Converter tabulações em espaços', value: removeTabs, set: setRemoveTabs },
        ].map((opt) => (
          <label key={opt.label} className="flex items-center gap-2 text-xs text-[#A1A1AA] cursor-pointer">
            <input type="checkbox" checked={opt.value} onChange={(e) => opt.set(e.target.checked)} className="rounded accent-violet-500" />
            {opt.label}
          </label>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={handleClean}
          className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Limpar Texto
        </button>
        {result && (
          <button onClick={handleCopy}
            className={cn('px-5 py-2.5 rounded-xl border text-sm font-medium transition-all flex items-center gap-2', copied ? 'border-green-500/30 text-green-400' : 'border-white/10 text-[#A1A1AA] hover:bg-white/5')}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        )}
      </div>
      {result && (
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
          <h3 className="text-xs text-[#A1A1AA] mb-2">Resultado ({result.length} caracteres)</h3>
          <pre className="text-sm text-green-300 whitespace-pre-wrap font-mono">{result}</pre>
        </div>
      )}
    </div>
  );
}
