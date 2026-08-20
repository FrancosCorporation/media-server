// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Code2, Download, CheckCircle2, AlertCircle, Upload, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function HtmlToPdf({ onBack: _onBack }: ToolProps) {
  const [html, setHtml] = useState('<h1>Olá, Mundo!</h1><p>Este é um PDF gerado a partir de HTML.</p>');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleConvert = useCallback(() => {
    if (!html.trim()) return;
    try {
      const style = `
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
          h1 { color: #7c3aed; }
          h2 { color: #6d28d9; }
          pre { background: #f5f5f5; padding: 12px; border-radius: 8px; overflow-x: auto; }
          code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
          img { max-width: 100%; }
        </style>
      `;
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">${style}</head><body>${html}</body></html>`;
      const blob = new Blob([fullHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }

      setStatus('success');
      setMessage('Janela de impressão aberta! Selecione "Salvar como PDF" na impressora.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Erro ao processar HTML.');
    }
  }, [html]);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">HTML para PDF</h2>
        <p className="text-sm text-[var(--wcag-text-secondary)] max-w-md mx-auto">
          Converta código HTML em PDF usando a impressão do navegador.
        </p>
      </div>
      <div>
        <label className="text-xs text-[#A1A1AA] mb-1 block">Insira seu HTML</label>
        <textarea
          value={html}
          onChange={(e) => { setHtml(e.target.value); setStatus('idle'); setMessage(''); }}
          placeholder="<h1>Meu Título</h1><p>Meu parágrafo.</p>"
          className="w-full h-48 p-4 rounded-2xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 resize-none placeholder:text-[#A1A1AA]/30 font-mono"
        />
      </div>
      {status === 'idle' && html.trim() && (
        <button onClick={handleConvert} className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg">
          <Eye className="w-5 h-5" /> Abrir para Imprimir (PDF)
        </button>
      )}
      {status === 'success' && (
        <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          <p className="text-white font-medium text-center">{message}</p>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{message}</p>
        </div>
      )}
      <p className="text-xs text-[var(--wcag-text-placeholder)] text-center">
        O PDF será gerado através da janela de impressão do seu navegador.
      </p>
    </div>
  );
}
