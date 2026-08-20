// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ColorPicker({ onBack: _onBack }: ToolProps) {
  const [color, setColor] = useState('#7C3AED');

  const hex = color;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const rgb = `rgb(${r}, ${g}, ${b})`;
  const hsl = `hsl(${Math.round(r / 255 * 360)}, ${Math.round(g / 255 * 100)}%, ${Math.round(b / 255 * 100)}%)`;

  const [copied, setCopied] = useState('');

  const handleCopy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
          className="w-32 h-32 rounded-2xl cursor-pointer border-2 border-white/10 bg-transparent" />
        <div className="space-y-3 flex-1 w-full">
          {[
            { label: 'HEX', value: hex },
            { label: 'RGB', value: rgb },
            { label: 'HSL', value: hsl },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-[#A1A1AA] w-10">{item.label}</span>
                <code className="text-sm text-white font-mono">{item.value}</code>
              </div>
              <button onClick={() => handleCopy(item.value, item.label)}
                className={cn('p-1.5 rounded-lg transition-all', copied === item.label ? 'text-green-400' : 'text-[#A1A1AA] hover:text-white')}>
                {copied === item.label ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4 rounded-xl" style={{ backgroundColor: color }}>
        <p className="text-sm font-medium text-center" style={{ color: r * 0.299 + g * 0.587 + b * 0.114 > 128 ? '#000' : '#fff' }}>
          Preview — {hex}
        </p>
      </div>
    </div>
  );
}
