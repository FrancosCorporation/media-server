// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Download, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ImageResizer({ onBack: _onBack }: ToolProps) {
  const [image, setImage] = useState<string | null>(null);
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(300);
  const [keepRatio, setKeepRatio] = useState(true);
  const [originalW, setOriginalW] = useState(0);
  const [originalH, setOriginalH] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileNameRef = useRef('imagem');

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    fileNameRef.current = file.name.replace(/\.[^/.]+$/, '');
    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    if (imgRef.current && image) {
      imgRef.current.onload = () => {
        const w = imgRef.current!.naturalWidth;
        const h = imgRef.current!.naturalHeight;
        setOriginalW(w);
        setOriginalH(h);
        setWidth(w);
        setHeight(h);
      };
      imgRef.current.src = image;
    }
  }, [image]);

  const handleWidthChange = (v: number) => {
    setWidth(v);
    if (keepRatio && originalW > 0) setHeight(Math.round(v * (originalH / originalW)));
  };

  const handleHeightChange = (v: number) => {
    setHeight(v);
    if (keepRatio && originalH > 0) setWidth(Math.round(v * (originalW / originalH)));
  };

  const handleResize = useCallback(() => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, width, height); };
    img.src = image;
    const a = document.createElement('a');
    setTimeout(() => {
      a.href = canvas.toDataURL('image/png');
      a.download = `${fileNameRef.current}_${width}x${height}.png`;
      a.click();
    }, 100);
  }, [image, width, height]);

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />
      <img ref={imgRef} className="hidden" />
      <label className="inline-flex px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium cursor-pointer transition-all items-center gap-2">
        <Upload className="w-4 h-4" /> Selecionar Imagem
        <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      </label>
      {image && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <img src={image} alt="Preview" className="max-h-48 rounded-lg" />
            <p className="text-xs text-[#A1A1AA] mt-2 text-center">{originalW} × {originalH} px</p>
          </div>
          <div className="space-y-4 flex-1">
            <div className="flex gap-4">
              <div><label className="text-xs text-[#A1A1AA]">Largura</label>
                <input type="number" value={width} onChange={(e) => handleWidthChange(parseInt(e.target.value) || 0)} min={1} max={4000}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
              </div>
              <div><label className="text-xs text-[#A1A1AA]">Altura</label>
                <input type="number" value={height} onChange={(e) => handleHeightChange(parseInt(e.target.value) || 0)} min={1} max={4000}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[#A1A1AA] cursor-pointer">
              <input type="checkbox" checked={keepRatio} onChange={(e) => setKeepRatio(e.target.checked)} className="rounded" />
              Manter proporção
            </label>
            <button onClick={handleResize} className="px-5 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-all flex items-center gap-2">
              <Download className="w-4 h-4" /> Redimensionar e Baixar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
