// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Download, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ImageConverter({ onBack: _onBack }: ToolProps) {
  const [image, setImage] = useState<string | null>(null);
  const [format, setFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileNameRef = useRef('imagem');

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    fileNameRef.current = file.name.replace(/\.[^/.]+$/, '');
    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleConvert = useCallback(() => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const ext = format.split('/')[1];
      const dataUrl = canvas.toDataURL(format, 0.92);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileNameRef.current}_convertido.${ext}`;
      a.click();
    };
    img.src = image;
  }, [image, format]);

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex items-center gap-4">
        <label className="px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium cursor-pointer transition-all flex items-center gap-2">
          <Upload className="w-4 h-4" /> Selecionar Imagem
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </label>
        <select value={format} onChange={(e) => setFormat(e.target.value as any)}
          className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50"
        >
          <option value="image/png">PNG</option>
          <option value="image/jpeg">JPEG</option>
          <option value="image/webp">WebP</option>
        </select>
        {image && (
          <button onClick={handleConvert} className="px-5 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-all flex items-center gap-2">
            <Download className="w-4 h-4" /> Converter e Baixar
          </button>
        )}
      </div>
      {image && (
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 inline-block">
          <img src={image} alt="Preview" className="max-h-64 rounded-lg" />
        </div>
      )}
    </div>
  );
}
