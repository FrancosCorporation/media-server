// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const FONTS = ['Arial', 'Helvetica', 'Georgia', 'Courier New', 'Verdana', 'Impact'];
const COLORS = ['#FFFFFF', '#000000', '#7c3aed', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

export default function TextToImage({ onBack: _onBack }: ToolProps) {
  const [text, setText] = useState('Francos Corp');
  const [font, setFont] = useState('Arial');
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState('#FFFFFF');
  const [bgColor, setBgColor] = useState('#1E1B4B');
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(400);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = text.split('\n');
    const lineHeight = fontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    const startY = (height - totalHeight) / 2 + lineHeight / 2;

    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, startY + i * lineHeight);
    });
  }, [text, font, fontSize, color, bgColor, width, height]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'texto_para_imagem.png';
    a.click();
  }, []);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Texto para Imagem</h2>
        <p className="text-sm text-[var(--wcag-text-secondary)] max-w-md mx-auto">
          Renderize texto como imagem PNG com fontes e cores personalizadas.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 space-y-4 w-full">
          <div>
            <label className="text-xs text-[#A1A1AA] mb-1 block">Texto</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full h-24 p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#A1A1AA] mb-1 block">Fonte</label>
              <select value={font} onChange={(e) => setFont(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none">
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#A1A1AA] mb-1 block">Tamanho</label>
              <input type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} min={8} max={200} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#A1A1AA] mb-1 block">Cor do Texto</label>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)} className={cn('w-7 h-7 rounded-lg border transition-all', color === c ? 'border-white ring-2 ring-white/30 scale-110' : 'border-white/20')} style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-7 h-7 rounded-lg border border-white/20 cursor-pointer" />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#A1A1AA] mb-1 block">Cor de Fundo</label>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setBgColor(c)} className={cn('w-7 h-7 rounded-lg border transition-all', bgColor === c ? 'border-white ring-2 ring-white/30 scale-110' : 'border-white/20')} style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-7 h-7 rounded-lg border border-white/20 cursor-pointer" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#A1A1AA] mb-1 block">Largura (px)</label>
              <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} min={100} max={4000} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-[#A1A1AA] mb-1 block">Altura (px)</label>
              <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} min={100} max={4000} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" />
            </div>
          </div>

          <button onClick={handleDownload} className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg">
            <Download className="w-5 h-5" /> Baixar PNG
          </button>
        </div>

        <div className="flex-shrink-0 w-full lg:w-auto">
          <canvas ref={canvasRef} className="rounded-2xl border border-white/10 shadow-lg max-w-full" />
        </div>
      </div>
    </div>
  );
}
