// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { FileText, Download, CheckCircle2, AlertCircle, Upload } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { cn } from '@/lib/utils';

export default function TxtToPdf({ onBack: _onBack }: ToolProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const handleConvert = useCallback(async () => {
    if (!text.trim()) return;
    setStatus('processing');
    setMessage('Gerando PDF...');
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontSize = 11;
      const margin = 50;
      const pageWidth = 595;
      const pageHeight = 842;
      const maxWidth = pageWidth - margin * 2;
      const lineHeight = fontSize * 1.4;

      const lines = text.split('\n');
      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;

      for (const line of lines) {
        if (line === '') {
          y -= lineHeight;
        } else {
          const words = line.split(' ');
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const testWidth = font.widthOfTextAtSize(testLine, fontSize);
            if (testWidth > maxWidth && currentLine) {
              page.drawText(currentLine, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
              y -= lineHeight;
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) {
            page.drawText(currentLine, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
            y -= lineHeight;
          }
        }
        if (y < margin) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
      setStatus('success');
      setMessage('PDF gerado com sucesso!');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Erro ao gerar PDF.');
    }
  }, [text]);

  const handleDownload = useCallback(() => {
    if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'documento_convertido.pdf';
      a.click();
    }
  }, [downloadUrl]);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">TXT para PDF</h2>
        <p className="text-sm text-[var(--wcag-text-secondary)] max-w-md mx-auto">
          Converta texto simples em um arquivo PDF formatado.
        </p>
      </div>
      <div>
        <label className="text-xs text-[#A1A1AA] mb-1 block">Insira seu texto</label>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setStatus('idle'); setMessage(''); setDownloadUrl(null); }}
          placeholder="Cole ou digite seu texto aqui..."
          className="w-full h-48 p-4 rounded-2xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 resize-none placeholder:text-[#A1A1AA]/30 font-mono"
        />
      </div>
      {status === 'idle' && text.trim() && (
        <button onClick={handleConvert} className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg">
          <Upload className="w-5 h-5" /> Gerar PDF
        </button>
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
          <button onClick={handleDownload} className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-medium flex items-center gap-2 shadow-lg">
            <Download className="w-5 h-5" /> Baixar PDF
          </button>
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
