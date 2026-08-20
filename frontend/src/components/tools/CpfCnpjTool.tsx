// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useCallback, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Algoritmo de validação de CPF ──────────────────────────────
function validateCPF(cpf: string): boolean {
  const nums = cpf.replace(/\D/g, '').split('').map(Number);
  if (nums.length !== 11 || nums.every((n) => n === nums[0])) return false;
  const calc = (digits: number[], factors: number[]) =>
    digits.reduce((sum, d, i) => sum + d * factors[i], 0) % 11;
  const d1 = calc(nums.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(nums.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return nums[9] === (d1 < 2 ? 0 : 11 - d1) && nums[10] === (d2 < 2 ? 0 : 11 - d2);
}

function generateCPF(masked: boolean): string {
  const nums = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
  const d1 = nums.reduce((s, n, i) => s + n * (10 - i), 0) % 11;
  nums.push(d1 < 2 ? 0 : 11 - d1);
  const d2 = nums.reduce((s, n, i) => s + n * (11 - i), 0) % 11;
  nums.push(d2 < 2 ? 0 : 11 - d2);
  const s = nums.join('');
  return masked ? `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}` : s;
}

export default function CpfCnpjTool({ onBack: _onBack }: ToolProps) {
  const [tab, setTab] = useState<'generate' | 'validate'>('generate');
  const [input, setInput] = useState('');
  const [generated, setGenerated] = useState('');
  const [validation, setValidation] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [masked, setMasked] = useState(true);

  const isValid = useMemo(() => input.length >= 11 ? validateCPF(input) : null, [input]);

  const handleGenerate = useCallback(() => {
    setGenerated(generateCPF(masked));
  }, [masked]);

  const handleCopy = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setTab('generate')}
          data-selected={tab === 'generate' || undefined}
          className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all', 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>
          Gerar CPF
        </button>
        <button onClick={() => setTab('validate')}
          data-selected={tab === 'validate' || undefined}
          className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all', 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>
          Validar CPF
        </button>
      </div>

      {tab === 'generate' && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-[#A1A1AA] cursor-pointer">
            <input type="checkbox" checked={masked} onChange={(e) => setMasked(e.target.checked)} className="rounded accent-violet-500" />
            Com máscara (xxx.xxx.xxx-xx)
          </label>
          <button onClick={handleGenerate} className="px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Gerar CPF
          </button>
          {generated && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <code className="text-lg font-mono text-white">{generated}</code>
              <button onClick={handleCopy} className={cn('p-2 rounded-lg', copied ? 'text-green-400' : 'text-[#A1A1AA] hover:text-white')}>
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'validate' && (
        <div className="space-y-4">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Digite o CPF (xxx.xxx.xxx-xx)"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 font-mono" maxLength={14} />
          {input.length >= 11 && (
            <div className={cn('p-4 rounded-xl text-center text-sm font-medium', isValid ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
              {isValid ? '✅ CPF Válido!' : '❌ CPF Inválido!'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
