// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Upload, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DominantColor { hex: string; count: number; }

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

function extractColors(data: ImageData, count: number = 5): DominantColor[] {
  const colorMap = new Map<string, number>();
  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = Math.round(pixels[i] / 32) * 32;
    const g = Math.round(pixels[i + 1] / 32) * 32;
    const b = Math.round(pixels[i + 2] / 32) * 32;
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }
  return Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, count]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { hex: rgbToHex(r, g, b), count };
    });
}

export default function ColorPalette({ onBack: _onBack }: ToolProps) {
  const [image, setImage] = useState<string | null>(null);
  const [colors, setColors] = useState<DominantColor[]>([]);
  const [copied, setCopied] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const analyze = useCallback(() => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = 50;
      canvas.height = 50;
      ctx.drawImage(img, 0, 0, 50, 50);
      const data = ctx.getImageData(0, 0, 50, 50);
      setColors(extractColors(data));
    };
    img.src = image;
  }, [image]);

  const handleCopy = async (hex: string) => {
    await navigator.clipboard.writeText(hex);
    setCopied(hex);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />
      <label className="inline-flex px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium cursor-pointer transition-all items-center gap-2">
        <Upload className="w-4 h-4" /> Selecionar Imagem
        <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      </label>
      {image && (
        <div className="flex gap-4 items-start">
          <img src={image} alt="Source" className="max-h-40 rounded-lg" />
          <button onClick={analyze} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm">Analisar Cores</button>
        </div>
      )}
      {colors.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {colors.map((c) => (
            <div key={c.hex} className="rounded-xl overflow-hidden border border-white/5">
              <div className="h-20" style={{ backgroundColor: c.hex }} />
              <div className="p-3 bg-white/[0.03]">
                <p className="text-sm font-mono text-white">{c.hex}</p>
                <p className="text-xs text-[#A1A1AA]">{c.count} pixels</p>
                <button onClick={() => handleCopy(c.hex)}
                  className={cn('mt-2 text-xs flex items-center gap-1', copied === c.hex ? 'text-green-400' : 'text-[#A1A1AA] hover:text-white')}>
                  {copied === c.hex ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === c.hex ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
