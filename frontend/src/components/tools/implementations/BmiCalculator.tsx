// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { cn } from '@/lib/utils';

function getBMIClassification(bmi: number): { label: string; color: string; range: string } {
  if (bmi < 18.5) return { label: 'Abaixo do peso', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', range: 'Abaixo de 18.5' };
  if (bmi < 25) return { label: 'Peso normal', color: 'text-green-400 bg-green-500/10 border-green-500/20', range: '18.5 - 24.9' };
  if (bmi < 30) return { label: 'Sobrepeso', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', range: '25 - 29.9' };
  if (bmi < 35) return { label: 'Obesidade Grau I', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', range: '30 - 34.9' };
  if (bmi < 40) return { label: 'Obesidade Grau II', color: 'text-red-400 bg-red-500/10 border-red-500/20', range: '35 - 39.9' };
  return { label: 'Obesidade Grau III', color: 'text-red-600 bg-red-500/20 border-red-500/30', range: 'Acima de 40' };
}

export default function BmiCalculator({ onBack: _onBack }: ToolProps) {
  const [weight, setWeight] = useState(70);
  const [height, setHeight] = useState(175);

  const bmi = useMemo(() => {
    const hInMeters = height / 100;
    if (hInMeters <= 0 || weight <= 0) return 0;
    return weight / (hInMeters * hInMeters);
  }, [weight, height]);

  const classification = useMemo(() => getBMIClassification(bmi), [bmi]);

  const idealMin = 18.5 * Math.pow(height / 100, 2);
  const idealMax = 24.9 * Math.pow(height / 100, 2);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Peso (kg)</label>
          <input type="number" value={weight} onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Altura (cm)</label>
          <input type="number" value={height} onChange={(e) => setHeight(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
      </div>

      <div className="text-center">
        <div className="text-5xl font-bold text-white mb-2">{bmi > 0 ? bmi.toFixed(1) : '—'}</div>
        <p className="text-sm text-[#A1A1AA]">Seu IMC</p>
      </div>

      <div className={cn('p-4 rounded-xl border text-center', classification.color)}>
        <p className="text-lg font-bold">{classification.label}</p>
        <p className="text-xs opacity-70">{classification.range}</p>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
        <h3 className="text-sm font-semibold text-white mb-3">Faixa de Peso Ideal</h3>
        <div className="flex justify-between text-sm">
          <span className="text-blue-400">{idealMin.toFixed(1)} kg</span>
          <span className="text-[#A1A1AA]">—</span>
          <span className="text-green-400">{idealMax.toFixed(1)} kg</span>
        </div>
        <div className="relative mt-2 h-3 rounded-full bg-white/5 overflow-hidden">
          <div
            className="absolute h-full rounded-full bg-gradient-to-r from-blue-500 via-green-500 to-red-500"
            style={{ left: `${Math.max(0, Math.min(100, ((bmi - 10) / 30) * 100))}%`, width: '4px' }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-[#A1A1AA]/50 mt-1">
          <span>Abaixo</span>
          <span>Normal</span>
          <span>Sobrepeso</span>
          <span>Obeso</span>
        </div>
      </div>
    </div>
  );
}
