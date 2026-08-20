// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

function generatePassword(length: number, upper: boolean, lower: boolean, numbers: boolean, symbols: boolean): string {
  const chars = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  };
  let pool = '';
  if (upper) pool += chars.upper;
  if (lower) pool += chars.lower;
  if (numbers) pool += chars.numbers;
  if (symbols) pool += chars.symbols;
  if (!pool) pool = chars.lower;
  let result = '';
  for (let i = 0; i < length; i++) result += pool[Math.floor(Math.random() * pool.length)];
  return result;
}

function getStrength(len: number, hasUpper: boolean, hasLower: boolean, hasNum: boolean, hasSym: boolean): { label: string; color: string; width: string } {
  const score = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0) + (hasNum ? 1 : 0) + (hasSym ? 1 : 0) + (len > 8 ? 1 : 0) + (len > 12 ? 1 : 0);
  if (score < 3) return { label: 'Fraca', color: 'bg-red-500', width: 'w-1/4' };
  if (score < 5) return { label: 'Média', color: 'bg-amber-500', width: 'w-2/4' };
  return { label: 'Forte', color: 'bg-green-500', width: 'w-full' };
}

export default function PasswordGenerator({ onBack: _onBack }: ToolProps) {
  const [length, setLength] = useState(12);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(false);
  const [password, setPassword] = useState(() => generatePassword(12, true, true, true, false));
  const [copied, setCopied] = useState(false);

  const strength = useMemo(() => getStrength(length, upper, lower, numbers, symbols), [length, upper, lower, numbers, symbols]);

  const regenerate = () => setPassword(generatePassword(length, upper, lower, numbers, symbols));

  const handleCopy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
        <p className="text-2xl font-mono text-center text-white break-all">{password}</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-sm text-[#A1A1AA]">Comprimento: <strong className="text-white">{length}</strong></label>
          <input type="range" min={6} max={32} value={length} onChange={(e) => setLength(parseInt(e.target.value))} className="w-full accent-violet-500" />
        </div>
        <div className="flex items-center gap-1">
          <div className={cn('h-2 rounded-full transition-all', strength.color, strength.width)} />
          <span className="text-xs text-[#A1A1AA] ml-2">{strength.label}</span>
        </div>
        {[
          { label: 'Letras Maiúsculas', value: upper, set: setUpper },
          { label: 'Letras Minúsculas', value: lower, set: setLower },
          { label: 'Números', value: numbers, set: setNumbers },
          { label: 'Símbolos', value: symbols, set: setSymbols },
        ].map((opt) => (
          <label key={opt.label} className="flex items-center gap-3 text-sm text-[#A1A1AA] cursor-pointer">
            <input type="checkbox" checked={opt.value} onChange={(e) => opt.set(e.target.checked)} className="rounded accent-violet-500" />
            {opt.label}
          </label>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={regenerate} className="flex-1 px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4" /> Gerar Nova Senha
        </button>
        <button onClick={handleCopy} className={cn('px-5 py-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-2', copied ? 'border-green-500/30 text-green-400' : 'border-white/10 text-[#A1A1AA] hover:bg-white/5')}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copiada!' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
