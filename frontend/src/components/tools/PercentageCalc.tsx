// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';

export default function PercentageCalc({ onBack: _onBack }: ToolProps) {
  const [val1, setVal1] = useState(0);
  const [val2, setVal2] = useState(0);
  const [val3, setVal3] = useState(0);
  const [val4, setVal4] = useState(0);
  const [val5, setVal5] = useState(0);
  const [val6, setVal6] = useState(0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Quanto é X% de Y? */}
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
        <h3 className="text-sm font-medium text-white mb-4">Quanto é X% de Y?</h3>
        <div className="space-y-3">
          <input type="number" value={val1} onChange={(e) => setVal1(parseFloat(e.target.value) || 0)}
            placeholder="X (%)" className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          <input type="number" value={val2} onChange={(e) => setVal2(parseFloat(e.target.value) || 0)}
            placeholder="Y" className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          <div className="p-3 rounded-xl bg-primary/10 text-center">
            <p className="text-2xl font-bold text-primary-light">{(val1 / 100 * val2).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* X é qual % de Y? */}
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
        <h3 className="text-sm font-medium text-white mb-4">X é qual % de Y?</h3>
        <div className="space-y-3">
          <input type="number" value={val3} onChange={(e) => setVal3(parseFloat(e.target.value) || 0)}
            placeholder="X" className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          <input type="number" value={val4} onChange={(e) => setVal4(parseFloat(e.target.value) || 0)}
            placeholder="Y" className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          <div className="p-3 rounded-xl bg-green-500/10 text-center">
            <p className="text-2xl font-bold text-green-400">{val4 > 0 ? ((val3 / val4) * 100).toFixed(2) : '0.00'}%</p>
          </div>
        </div>
      </div>

      {/* Variação percentual de X para Y */}
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
        <h3 className="text-sm font-medium text-white mb-4">Variação % de X para Y</h3>
        <div className="space-y-3">
          <input type="number" value={val5} onChange={(e) => setVal5(parseFloat(e.target.value) || 0)}
            placeholder="X (valor antigo)" className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          <input type="number" value={val6} onChange={(e) => setVal6(parseFloat(e.target.value) || 0)}
            placeholder="Y (valor novo)" className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          <div className="p-3 rounded-xl bg-amber-500/10 text-center">
            <p className="text-2xl font-bold text-amber-400">{val5 > 0 ? (((val6 - val5) / val5) * 100).toFixed(2) : '0.00'}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
