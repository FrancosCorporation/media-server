// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { FileText, Download, X, CheckCircle2, AlertCircle, Upload, Image } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PdfToJpg({ onBack: _onBack }: ToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<{ dataUrl: string; page: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setFile(e.target.files[0]);
    setStatus('idle');
    setMessage('');
    setImages([]);
  };

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setStatus('processing');
    setMessage('Renderizando páginas...');
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const result: { dataUrl: string; page: number }[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        result.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.9), page: i });
      }

      setImages(result);
      setStatus('success');
      setMessage(`${result.length} ${result.length === 1 ? 'página convertida' : 'páginas convertidas'}!`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Erro ao processar PDF.');
    }
  }, [file]);

  const handleDownloadAll = useCallback(() => {
    images.forEach((img) => {
      const a = document.createElement('a');
      a.href = img.dataUrl;
      a.download = `pagina_${img.page}.jpg`;
      a.click();
    });
  }, [images]);

  const handleDownloadOne = useCallback((dataUrl: string, page: number) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `pagina_${page}.jpg`;
    a.click();
  }, []);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">PDF para JPG</h2>
        <p className="text-sm text-[var(--wcag-text-secondary)] max-w-md mx-auto">
          Converta páginas de PDF em imagens JPG.
        </p>
      </div>
      <div onClick={() => fileInputRef.current?.click()} className="relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 border-white/10 hover:border-violet-400/50 hover:bg-white/[0.02]">
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleSelect} />
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-white/5">
          <FileText className="w-8 h-8 text-[#A1A1AA]" />
        </div>
        {file ? (
          <p className="text-sm font-medium text-white">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-white mb-1">Clique para selecionar um PDF</p>
            <p className="text-xs text-[#A1A1AA]">Formatos aceitos: PDF</p>
          </>
        )}
      </div>
      {file && status === 'idle' && (
        <button onClick={handleConvert} className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg">
          <Upload className="w-5 h-5" /> Converter para JPG
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
          <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <p className="text-white font-medium">{message}</p>
            </div>
            {images.length > 1 && (
              <button onClick={handleDownloadAll} className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-medium flex items-center gap-2">
                <Download className="w-4 h-4" /> Baixar Todas
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((img) => (
              <div key={img.page} className="relative group rounded-xl overflow-hidden border border-white/10">
                <img src={img.dataUrl} alt={`Página ${img.page}`} className="w-full h-auto" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button onClick={() => handleDownloadOne(img.dataUrl, img.page)} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                    <Download className="w-5 h-5 text-white" />
                  </button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                  <span className="text-xs text-white/80">Página {img.page}</span>
                </div>
              </div>
            ))}
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
