// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Image, Download, X, CheckCircle2, AlertCircle, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function InvertImage({ onBack: _onBack }: ToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setFile(e.target.files[0]);
    setStatus('idle');
    setMessage('');
    setResultUrl(null);
  };

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setStatus('processing');
    setMessage('Invertendo cores...');
    try {
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = canvasRef.current!;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i];
          data[i + 1] = 255 - data[i + 1];
          data[i + 2] = 255 - data[i + 2];
        }
        ctx.putImageData(imageData, 0, 0);
        setResultUrl(canvas.toDataURL('image/png'));
        setStatus('success');
        setMessage('Cores invertidas com sucesso!');
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Erro ao processar imagem.');
    }
  }, [file]);

  const handleDownload = useCallback(() => {
    if (resultUrl) {
      const a = document.createElement('a');
      a.href = resultUrl;
      a.download = 'imagem_invertida.png';
      a.click();
    }
  }, [resultUrl]);

  return (
    <div className="space-y-5">
      <canvas ref={canvasRef} className="hidden" />
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Inverter Cores</h2>
        <p className="text-sm text-[var(--wcag-text-secondary)] max-w-md mx-auto">
          Inverta as cores de uma imagem (negativo).
        </p>
      </div>
      <div onClick={() => fileInputRef.current?.click()} className="relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 border-white/10 hover:border-violet-400/50 hover:bg-white/[0.02]">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSelect} />
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-white/5">
          <Image className="w-8 h-8 text-[#A1A1AA]" />
        </div>
        {file ? (
          <p className="text-sm font-medium text-white">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-white mb-1">Clique para selecionar uma imagem</p>
            <p className="text-xs text-[#A1A1AA]">Formatos aceitos: PNG, JPG, WebP</p>
          </>
        )}
      </div>
      {file && status === 'idle' && (
        <button onClick={handleConvert} className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg">
          <Upload className="w-5 h-5" /> Inverter Cores
        </button>
      )}
      {status === 'processing' && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
          <div className="w-5 h-5 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
          <p className="text-sm text-blue-300">{message}</p>
        </div>
      )}
      {status === 'success' && resultUrl && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <p className="text-white font-medium">{message}</p>
            </div>
            <button onClick={handleDownload} className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4" /> Baixar
            </button>
          </div>
          <div className="flex gap-4 items-start justify-center">
            <div>
              <p className="text-xs text-[#A1A1AA] mb-2 text-center">Original</p>
              {file && <img src={URL.createObjectURL(file)} alt="Original" className="max-w-[200px] rounded-xl border border-white/10" />}
            </div>
            <div>
              <p className="text-xs text-[#A1A1AA] mb-2 text-center">Invertida</p>
              <img src={resultUrl} alt="Invertida" className="max-w-[200px] rounded-xl border border-white/10" />
            </div>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{message}</p>
        </div>
      )}
    </div>
  );
}
