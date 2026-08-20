// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, Code } from 'lucide-react';
import { cn } from '@/lib/utils';

type LangType = 'html' | 'css' | 'js';

function formatHTML(code: string): string {
  let indent = 0;
  const lines = code.replace(/>\s*</g, '>\n<').split('\n');
  const result: string[] = [];
  const selfClosing = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^<\//.test(trimmed)) indent--;
    result.push('  '.repeat(Math.max(0, indent)) + trimmed);
    if (/^<[^/?!]/.test(trimmed) && !/\/>$/.test(trimmed) && !selfClosing.test(trimmed.match(/^<(\w+)/)?.[1] || '')) indent++;
  }
  return result.join('\n');
}

function formatCSS(code: string): string {
  return code
    .replace(/\s*{\s*/g, ' {\n  ')
    .replace(/\s*}\s*/g, '\n}\n')
    .replace(/;\s*/g, ';\n  ')
    .replace(/,\s*/g, ', ')
    .replace(/\n\s*\n\s*}/g, '\n}')
    .trim();
}

function formatJS(code: string): string {
  let indent = 0;
  const result: string[] = [];
  let token = '';
  for (const ch of code) {
    if ('{('.includes(ch)) {
      if (token.trim()) result.push('  '.repeat(indent) + token.trim());
      result.push('  '.repeat(indent) + ch);
      indent++;
      token = '';
    } else if ('})'.includes(ch)) {
      if (token.trim()) result.push('  '.repeat(indent) + token.trim());
      indent = Math.max(0, indent - 1);
      result.push('  '.repeat(indent) + ch);
      token = '';
    } else if (ch === ';') {
      token += ch;
      result.push('  '.repeat(indent) + token.trim());
      token = '';
    } else {
      token += ch;
    }
  }
  if (token.trim()) result.push('  '.repeat(Math.max(0, indent)) + token.trim());
  return result.join('\n');
}

export default function CodeFormatter({ onBack: _onBack }: ToolProps) {
  const [code, setCode] = useState('');
  const [lang, setLang] = useState<LangType>('html');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleFormat = () => {
    setError('');
    try {
      let result = '';
      switch (lang) {
        case 'html': result = formatHTML(code); break;
        case 'css': result = formatCSS(code); break;
        case 'js': result = formatJS(code); break;
      }
      setOutput(result);
    } catch (e: any) {
      setError(e.message || 'Erro ao formatar código');
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
      <div className="flex flex-wrap gap-3">
        {(['html', 'css', 'js'] as LangType[]).map((l) => (
          <button key={l} onClick={() => { setLang(l); setOutput(''); setError(''); }}
            data-selected={lang === l || undefined}
            className={cn('px-4 py-2 rounded-xl text-sm font-medium border transition-all uppercase', 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>
            {l}
          </button>
        ))}
        <button onClick={handleFormat}
          className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all flex items-center gap-2 ml-auto">
          <Code className="w-4 h-4" /> Formatar
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={12}
          placeholder={`Cole seu código ${lang.toUpperCase()} aqui...`}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono outline-none focus:border-primary/50 resize-y" />
        <div className="relative">
          <textarea value={error || output} readOnly rows={12}
            className={cn('w-full px-4 py-3 rounded-xl border text-sm font-mono outline-none resize-y', error ? 'bg-red-500/5 border-red-500/20 text-red-300' : 'bg-white/5 border-white/10 text-green-300')} />
          {output && (
            <button onClick={handleCopy} className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
