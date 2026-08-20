// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, ArrowLeftRight, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Base64Tool({ onBack: _onBack }: ToolProps) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const handleConvert = () => {
    setError('');
    try {
      if (mode === 'encode') setOutput(btoa(unescape(encodeURIComponent(input))));
      else setOutput(decodeURIComponent(escape(atob(input))));
    } catch (e: any) {
      setError('Erro: ' + (e.message || 'Texto inválido para essa operação'));
      setOutput('');
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied('output');
    setTimeout(() => setCopied(''), 2000);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setInput(ev.target?.result as string);
      setMode('encode');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => { setMode('encode'); setOutput(''); setError(''); }}
          data-selected={mode === 'encode' || undefined}
          className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all', 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>
          Codificar
        </button>
        <button onClick={() => { setMode('decode'); setOutput(''); setError(''); }}
          data-selected={mode === 'decode' || undefined}
          className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all', 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>
          Decodificar
        </button>
        <button onClick={handleConvert} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4" /> Executar
        </button>
        <label className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-[#A1A1AA] hover:text-white cursor-pointer flex items-center gap-2">
          <Upload className="w-4 h-4" /> Arquivo
          <input type="file" onChange={handleFile} className="hidden" />
        </label>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">{mode === 'encode' ? 'Texto' : 'Base64'}</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={8}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono outline-none focus:border-primary/50 resize-y" />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Resultado</label>
          <div className="relative">
            <textarea value={error || output} readOnly rows={8}
              className={cn('w-full px-4 py-3 rounded-xl border text-sm font-mono outline-none resize-y', error ? 'bg-red-500/5 border-red-500/20 text-red-300' : 'bg-white/5 border-white/10 text-green-300')} />
            {output && (
              <button onClick={() => handleCopy(output)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white">
                {copied === 'output' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
