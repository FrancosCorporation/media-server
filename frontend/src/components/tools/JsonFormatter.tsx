// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function JsonFormatter({ onBack: _onBack }: ToolProps) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleFormat = () => {
    setError('');
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
    } catch (e: any) {
      setError(e.message || 'JSON inválido');
      setOutput('');
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={handleFormat} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all">
          Formatar / Validar
        </button>
        {output && (
          <button onClick={handleCopy} className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-[#A1A1AA] hover:text-white transition-all flex items-center gap-2">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">JSON de entrada</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={12}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono outline-none focus:border-primary/50 resize-y"
            placeholder='{"exemplo": "cole seu JSON aqui"}' />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Saída formatada</label>
          <textarea value={output || error} readOnly rows={12}
            className={cn('w-full px-4 py-3 rounded-xl border text-sm font-mono outline-none resize-y', error ? 'bg-red-500/5 border-red-500/20 text-red-300' : 'bg-white/5 border-white/10 text-green-300')}
            placeholder="JSON formatado aparecerá aqui..." />
        </div>
      </div>
    </div>
  );
}
