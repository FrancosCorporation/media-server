// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { ArrowLeftRight, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type UnitCategory = 'length' | 'weight' | 'temp' | 'data';

const conversions: Record<UnitCategory, { unit: string; toBase: (v: number) => number; fromBase: (v: number) => number }[]> = {
  length: [
    { unit: 'Metros', toBase: (v) => v, fromBase: (v) => v },
    { unit: 'Quilômetros', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    { unit: 'Centímetros', toBase: (v) => v / 100, fromBase: (v) => v * 100 },
    { unit: 'Milímetros', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    { unit: 'Polegadas', toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
    { unit: 'Pés', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    { unit: 'Milhas', toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
  ],
  weight: [
    { unit: 'Gramas', toBase: (v) => v, fromBase: (v) => v },
    { unit: 'Quilogramas', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    { unit: 'Miligramas', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    { unit: 'Libras', toBase: (v) => v * 453.592, fromBase: (v) => v / 453.592 },
    { unit: 'Onças', toBase: (v) => v * 28.3495, fromBase: (v) => v / 28.3495 },
    { unit: 'Toneladas', toBase: (v) => v * 1e6, fromBase: (v) => v / 1e6 },
  ],
  temp: [
    { unit: 'Celsius', toBase: (v) => v, fromBase: (v) => v },
    { unit: 'Fahrenheit', toBase: (v) => (v - 32) * 5 / 9, fromBase: (v) => v * 9 / 5 + 32 },
    { unit: 'Kelvin', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
  ],
  data: [
    { unit: 'Bytes', toBase: (v) => v, fromBase: (v) => v },
    { unit: 'KB', toBase: (v) => v * 1024, fromBase: (v) => v / 1024 },
    { unit: 'MB', toBase: (v) => v * 1024 * 1024, fromBase: (v) => v / (1024 * 1024) },
    { unit: 'GB', toBase: (v) => v * 1024 * 1024 * 1024, fromBase: (v) => v / (1024 * 1024 * 1024) },
    { unit: 'TB', toBase: (v) => v * 1024 * 1024 * 1024 * 1024, fromBase: (v) => v / (1024 * 1024 * 1024 * 1024) },
  ],
};

const categories: { id: UnitCategory; label: string }[] = [
  { id: 'length', label: 'Comprimento' },
  { id: 'weight', label: 'Peso' },
  { id: 'temp', label: 'Temperatura' },
  { id: 'data', label: 'Dados' },
];

export default function UnitConverter({ onBack: _onBack }: ToolProps) {
  const [category, setCategory] = useState<UnitCategory>('length');
  const [fromUnit, setFromUnit] = useState(0);
  const [toUnit, setToUnit] = useState(1);
  const [value, setValue] = useState('1');
  const [copied, setCopied] = useState(false);

  const units = conversions[category];

  const result = useMemo(() => {
    const v = parseFloat(value);
    if (isNaN(v)) return '';
    const base = units[fromUnit].toBase(v);
    return units[toUnit].fromBase(base).toFixed(6);
  }, [value, fromUnit, toUnit, units]);

  const handleSwap = () => {
    const temp = fromUnit;
    setFromUnit(toUnit);
    setToUnit(temp);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button key={cat.id} onClick={() => { setCategory(cat.id); setFromUnit(0); setToUnit(1); }}
            data-selected={category === cat.id || undefined}
            className={cn('px-4 py-2 rounded-xl text-sm font-medium border transition-all', 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>
            {cat.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">De</label>
          <input type="number" value={value} onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 mb-2" />
          <select value={fromUnit} onChange={(e) => setFromUnit(parseInt(e.target.value))}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50">
            {units.map((u, i) => <option key={i} value={i}>{u.unit}</option>)}
          </select>
        </div>
        <button onClick={handleSwap} className="mt-6 p-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary-light transition-all">
          <ArrowLeftRight className="w-5 h-5" />
        </button>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Para</label>
          <div className="h-[42px] mb-2 flex items-center">
            {result && (
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-primary-light">{parseFloat(result).toString()}</span>
                <button onClick={handleCopy} className="p-1 rounded hover:bg-white/5 text-[#A1A1AA] hover:text-white">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
          <select value={toUnit} onChange={(e) => setToUnit(parseInt(e.target.value))}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50">
            {units.map((u, i) => <option key={i} value={i}>{u.unit}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
