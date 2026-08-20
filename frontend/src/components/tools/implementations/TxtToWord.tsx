// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { FileText, Download, CheckCircle2, AlertCircle, Upload } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { cn } from '@/lib/utils';

export default function TxtToWord({ onBack: _onBack }: ToolProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const handleConvert = useCallback(async () => {
    if (!text.trim()) return;
    setStatus('processing');
    setMessage('Gerando documento Word...');
    try {
      const lines = text.split('\n');
      const paragraphs = lines.map((line) =>
        new Paragraph({
          children: [new TextRun({ text: line || ' ', size: 22, font: 'Calibri' })],
          spacing: { after: line === '' ? 200 : 120 },
        })
      );

      const doc = new Document({
        sections: [{ children: paragraphs }],
      });

      const blob = await Packer.toBlob(doc);
      setDownloadUrl(URL.createObjectURL(blob));
      setStatus('success');
      setMessage('Documento Word gerado com sucesso!');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Erro ao gerar documento.');
    }
  }, [text]);

  const handleDownload = useCallback(() => {
    if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'documento_convertido.docx';
      a.click();
    }
  }, [downloadUrl]);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">TXT para Word</h2>
        <p className="text-sm text-[var(--wcag-text-secondary)] max-w-md mx-auto">
          Converta texto simples em um documento .docx editável.
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
          <Upload className="w-5 h-5" /> Gerar Word
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
            <Download className="w-5 h-5" /> Baixar .docx
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
