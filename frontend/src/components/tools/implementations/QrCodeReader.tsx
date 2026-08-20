// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Camera, Upload, X, CheckCircle2, AlertCircle, Copy, Check, Link, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function QrCodeReader({ onBack: _onBack }: ToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [result, setResult] = useState('');
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const f = e.target.files[0];
    setFile(f);
    setStatus('idle');
    setMessage('');
    setResult('');
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleScan = useCallback(async () => {
    if (!file) return;
    setStatus('processing');
    setMessage('Escaneando QR Code...');
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const jsQR = (await import('jsqr')).default;
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          setResult(code.data);
          setStatus('success');
          setMessage('QR Code lido com sucesso!');
        } else {
          setStatus('error');
          setMessage('Nenhum QR Code encontrado na imagem.');
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Erro ao ler QR Code.');
    }
  }, [file]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const handleOpenLink = useCallback(() => {
    if (result.startsWith('http://') || result.startsWith('https://')) {
      window.open(result, '_blank');
    }
  }, [result]);

  const handleReset = useCallback(() => {
    setFile(null);
    setStatus('idle');
    setMessage('');
    setResult('');
    setPreviewUrl(null);
  }, []);

  const isUrl = result.startsWith('http://') || result.startsWith('https://');

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Leitor de QR Code</h2>
        <p className="text-sm text-[var(--wcag-text-secondary)] max-w-md mx-auto">
          Faça upload de uma imagem contendo um QR Code para ler seu conteúdo.
        </p>
      </div>

      {!file && (
        <div onClick={() => fileInputRef.current?.click()} className="relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 border-white/10 hover:border-violet-400/50 hover:bg-white/[0.02]">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSelect} />
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-white/5">
            <Camera className="w-8 h-8 text-[#A1A1AA]" />
          </div>
          <p className="text-sm font-medium text-white mb-1">Clique para selecionar uma imagem</p>
          <p className="text-xs text-[#A1A1AA]">Selecione uma foto contendo QR Code</p>
        </div>
      )}

      {file && previewUrl && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-3 min-w-0">
              <Camera className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" />
              <span className="text-sm text-white truncate">{file.name}</span>
            </div>
            <button onClick={handleReset} className="p-1 rounded-lg hover:bg-red-500/10 text-[#A1A1AA] hover:text-red-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex justify-center">
            <img src={previewUrl} alt="Preview" className="max-w-[300px] max-h-[300px] rounded-2xl border border-white/10" />
          </div>

          {status === 'idle' && (
            <button onClick={handleScan} className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg">
              <Upload className="w-5 h-5" /> Escanear QR Code
            </button>
          )}

          {status === 'processing' && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <div className="w-5 h-5 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
              <p className="text-sm text-blue-300">{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <p className="text-sm text-emerald-300 font-medium">{message}</p>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                  {isUrl ? <Link className="w-4 h-4 text-primary-light flex-shrink-0" /> : <FileText className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" />}
                  <span className="text-sm text-white break-all">{result}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={handleCopy} className={cn('px-3 py-2 rounded-xl border text-sm font-medium transition-all flex items-center gap-2', copied ? 'border-green-500/30 text-green-400' : 'border-white/10 text-[#A1A1AA] hover:bg-white/5')}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                  {isUrl && (
                    <button onClick={handleOpenLink} className="px-3 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium flex items-center gap-2">
                      <Link className="w-4 h-4" /> Abrir Link
                    </button>
                  )}
                  <button onClick={handleReset} className="px-3 py-2 rounded-xl border border-white/10 text-[#A1A1AA] hover:bg-white/5 text-sm font-medium">
                    Nova Leitura
                  </button>
                </div>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{message}</p>
              </div>
              <button onClick={handleReset} className="w-full px-4 py-2 rounded-xl border border-white/10 text-[#A1A1AA] hover:bg-white/5 text-sm font-medium">
                Tentar outra imagem
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
