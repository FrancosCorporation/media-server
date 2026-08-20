// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { FileText, Download, Copy, Check, CheckCircle2, X, AlertCircle, Upload, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PdfToText({ onBack: _onBack }: ToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setFile(e.target.files[0]);
    setStatus('idle');
    setMessage('');
    setText('');
  };

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setStatus('processing');
    setMessage('Extraindo texto...');
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';
      }

      setText(fullText.trim());
      setStatus('success');
      setMessage(`${pdf.numPages} ${pdf.numPages === 1 ? 'página processada' : 'páginas processadas'}!`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Erro ao extrair texto do PDF.');
    }
  }, [file]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'texto_extraido.txt';
    a.click();
  }, [text]);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">PDF para Texto</h2>
        <p className="text-sm text-[var(--wcag-text-secondary)] max-w-md mx-auto">
          Extraia todo o texto de arquivos PDF.
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
          <Upload className="w-5 h-5" /> Extrair Texto
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
            <div className="flex gap-2">
              <button onClick={handleCopy} className={cn('px-3 py-2 rounded-xl border text-sm font-medium transition-all flex items-center gap-2', copied ? 'border-green-500/30 text-green-400' : 'border-white/10 text-[#A1A1AA] hover:bg-white/5')}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
              <button onClick={handleDownload} className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-medium flex items-center gap-2">
                <Download className="w-4 h-4" /> TXT
              </button>
            </div>
          </div>
          <div className="relative">
            <textarea
              readOnly
              value={text}
              className="w-full h-64 p-4 rounded-2xl bg-white/5 border border-white/10 text-white text-sm outline-none resize-none font-mono"
            />
            <FileCode2 className="absolute top-3 right-3 w-4 h-4 text-[#A1A1AA]/50" />
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
