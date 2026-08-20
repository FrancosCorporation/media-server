// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function FindReplace({ onBack: _onBack }: ToolProps) {
  const [text, setText] = useState('');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [result, setResult] = useState('');
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleReplace = () => {
    if (!find || !text) { setResult(text); setCount(0); return; }
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      const matches = text.match(regex);
      setCount(matches ? matches.length : 0);
      setResult(text.replace(regex, replace));
    } catch {
      setResult('Erro na expressão de busca.');
      setCount(0);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
        placeholder="Cole seu texto aqui..."
        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 resize-y" />
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-[#A1A1AA] mb-1 block">Buscar</label>
          <input type="text" value={find} onChange={(e) => setFind(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" placeholder="palavra ou termo" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-[#A1A1AA] mb-1 block">Substituir por</label>
          <input type="text" value={replace} onChange={(e) => setReplace(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" placeholder="novo texto" />
        </div>
        <label className="flex items-center gap-2 text-xs text-[#A1A1AA] pb-1">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)}
            className="rounded accent-violet-500" /> Case-Sensitive
        </label>
        <button onClick={handleReplace}
          className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all flex items-center gap-2">
          <Search className="w-4 h-4" /> Substituir
        </button>
      </div>
      {count > 0 && <p className="text-sm text-green-400">🔍 {count} ocorrência(s) encontrada(s) e substituída(s).</p>}
      {result && (
        <div className="relative">
          <textarea value={result} readOnly rows={5}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-green-300 text-sm font-mono outline-none resize-y" />
          <button onClick={handleCopy} className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
