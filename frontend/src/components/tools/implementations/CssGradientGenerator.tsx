// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ColorStop {
  id: number;
  color: string;
  position: number; // 0-100
}

export default function CssGradientGenerator({ onBack: _onBack }: ToolProps) {
  const [angle, setAngle] = useState(135);
  const [stops, setStops] = useState<ColorStop[]>([
    { id: 1, color: '#8B5CF6', position: 0 },
    { id: 2, color: '#EC4899', position: 100 },
  ]);
  const [copied, setCopied] = useState(false);

  const addStop = useCallback(() => {
    const mid = Math.round((stops[stops.length - 2]?.position || 0) + 50);
    setStops([...stops, { id: Date.now(), color: '#A78BFA', position: Math.min(mid, 100) }]);
  }, [stops]);

  const removeStop = useCallback((id: number) => {
    if (stops.length <= 2) return;
    setStops(stops.filter((s) => s.id !== id));
  }, [stops]);

  const updateStop = useCallback((id: number, field: 'color' | 'position', value: string | number) => {
    setStops(stops.map((s) => s.id === id ? { ...s, [field]: value } : s));
  }, [stops]);

  const sortedStops = [...stops].sort((a, b) => a.position - b.position);

  const gradientCSS = `background: linear-gradient(${angle}deg, ${sortedStops.map((s) => `${s.color} ${s.position}%`).join(', ')});`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(gradientCSS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-5">
        <h3 className="text-sm font-semibold text-white">Configuração</h3>
        <div>
          <label className="text-xs text-[#A1A1AA]">Ângulo: <strong className="text-white">{angle}°</strong></label>
          <input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(parseInt(e.target.value))}
            className="w-full accent-violet-500 mt-1" />
        </div>
        <div className="space-y-3">
          {sortedStops.map((stop) => (
            <div key={stop.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <input type="color" value={stop.color} onChange={(e) => updateStop(stop.id, 'color', e.target.value)}
                className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer" />
              <div className="flex-1">
                <input type="range" min={0} max={100} value={stop.position} onChange={(e) => updateStop(stop.id, 'position', parseInt(e.target.value))}
                  className="w-full accent-violet-500" />
                <span className="text-xs text-[#A1A1AA]">{stop.position}%</span>
              </div>
              {stops.length > 2 && (
                <button onClick={() => removeStop(stop.id)}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button onClick={addStop}
          className="px-4 py-2 rounded-xl border border-dashed border-white/10 text-sm text-[#A1A1AA] hover:text-white hover:border-white/20 transition-all flex items-center gap-2">
          <Plus className="w-4 h-4" /> Adicionar Cor
        </button>
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#A1A1AA]">CSS Gerado</span>
            <button onClick={handleCopy}
              className={cn('p-1.5 rounded-lg transition-all', copied ? 'text-green-400' : 'text-[#A1A1AA] hover:text-white')}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <code className="text-xs text-green-300 font-mono break-all">{gradientCSS}</code>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Preview</h3>
        <div
          className="w-full h-64 lg:h-full min-h-[200px] rounded-2xl border border-white/10 shadow-lg"
          style={{ background: `linear-gradient(${angle}deg, ${sortedStops.map((s) => `${s.color} ${s.position}%`).join(', ')})` }}
        />
      </div>
    </div>
  );
}
