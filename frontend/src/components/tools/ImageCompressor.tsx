// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ImageCompressor({ onBack: _onBack }: ToolProps) {
  const [image, setImage] = useState<string | null>(null);
  const [quality, setQuality] = useState(80);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileNameRef = useRef('imagem');

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    fileNameRef.current = file.name.replace(/\.[^/.]+$/, '');
    setOriginalSize(file.size);
    setCompressedSize(null);
    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleCompress = useCallback(() => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        setCompressedSize(blob.size);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${fileNameRef.current}_comprimido.jpg`;
        a.click();
      }, 'image/jpeg', quality / 100);
    };
    img.src = image;
  }, [image, quality]);

  const estimatedSize = originalSize > 0 ? Math.round(originalSize * (quality / 100)) : 0;

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />
      <label className="inline-flex px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium cursor-pointer transition-all items-center gap-2">
        <Upload className="w-4 h-4" /> Selecionar Imagem
        <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      </label>
      {image && (
        <div className="space-y-4">
          <div className="flex items-center gap-6">
            <img src={image} alt="Preview" className="max-h-32 rounded-lg" />
            <div>
              <p className="text-sm text-[#A1A1AA]">Original: <strong className="text-white">{(originalSize / 1024).toFixed(1)} KB</strong></p>
              {compressedSize !== null && (
                <p className="text-sm text-green-400">Comprimido: <strong>{(compressedSize / 1024).toFixed(1)} KB</strong> ({Math.round((1 - compressedSize / originalSize) * 100)}% menor)</p>
              )}
            </div>
          </div>
          <div className="max-w-md">
            <label className="text-sm text-[#A1A1AA]">Qualidade: <strong className="text-white">{quality}%</strong></label>
            <input type="range" min={10} max={100} value={quality} onChange={(e) => setQuality(parseInt(e.target.value))}
              className="w-full mt-2 accent-violet-500" />
            <p className="text-xs text-[#A1A1AA]/50 mt-1">Tamanho estimado: {(estimatedSize / 1024).toFixed(1)} KB</p>
          </div>
          <button onClick={handleCompress} className="px-5 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-all">
            Comprimir e Baixar
          </button>
        </div>
      )}
    </div>
  );
}
