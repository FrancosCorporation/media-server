// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Image, Download, X, CheckCircle2, AlertCircle, Upload } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { cn } from '@/lib/utils';

export default function JpgToPdf({ onBack: _onBack }: ToolProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles(Array.from(e.target.files));
    setStatus('idle');
    setMessage('');
    setDownloadUrl(null);
  };

  const handleConvert = useCallback(async () => {
    if (files.length === 0) return;
    setStatus('processing');
    setMessage('Processando imagens...');
    try {
      const pdfDoc = await PDFDocument.create();
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const imageBytes = new Uint8Array(arrayBuffer);
        const isPng = file.type === 'image/png';
        const image = isPng
          ? await pdfDoc.embedPng(imageBytes)
          : await pdfDoc.embedJpg(imageBytes);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
      setStatus('success');
      setMessage(`${files.length} ${files.length === 1 ? 'imagem convertida' : 'imagens convertidas'} para PDF!`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Erro ao processar imagens.');
    }
  }, [files]);

  const handleDownload = useCallback(() => {
    if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'imagens_convertido.pdf';
      a.click();
    }
  }, [downloadUrl]);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">JPG / PNG para PDF</h2>
        <p className="text-sm text-[var(--wcag-text-secondary)] max-w-md mx-auto">
          Converta imagens JPG ou PNG em um arquivo PDF.
        </p>
      </div>
      <div onClick={() => fileInputRef.current?.click()} className="relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 border-white/10 hover:border-violet-400/50 hover:bg-white/[0.02]">
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" multiple className="hidden" onChange={handleSelect} />
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-white/5">
          <Image className="w-8 h-8 text-[#A1A1AA]" />
        </div>
        <p className="text-sm font-medium text-white mb-1">Clique para selecionar imagens</p>
        <p className="text-xs text-[#A1A1AA]">Formatos aceitos: JPG, PNG</p>
      </div>
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
              <span className="text-sm text-white truncate">{file.name}</span>
              <button onClick={() => { setFiles(prev => prev.filter((_, j) => j !== i)); setStatus('idle'); setMessage(''); setDownloadUrl(null); }} className="p-1 rounded-lg hover:bg-red-500/10 text-[#A1A1AA] hover:text-red-400"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
      {status === 'idle' && files.length > 0 && (
        <button onClick={handleConvert} className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg"><Upload className="w-5 h-5" /> Converter para PDF</button>
      )}
      {status === 'processing' && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
          <div className="w-5 h-5 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
          <p className="text-sm text-blue-300">{message}</p>
        </div>
      )}
      {status === 'success' && (
        <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          <p className="text-white font-medium">{message}</p>
          <button onClick={handleDownload} className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-medium flex items-center gap-2 shadow-lg"><Download className="w-5 h-5" /> Baixar PDF</button>
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
