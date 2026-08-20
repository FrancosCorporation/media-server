// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import {
  Upload,
  X,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { apiBase } from '@/lib/api';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

interface ConverterConfig {
  id: string;
  title: string;
  description: string;
  endpoint: string;
  accept: string;
  outputExt: string;
  multiple?: boolean;
  minFiles?: number;
  accent: {
    bg: string;
    border: string;
    text: string;
    gradient: string;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileNameWithoutExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function createDocumentConverter(config: ConverterConfig) {
  const { id, title, description, endpoint, accept, outputExt, multiple, minFiles = 1, accent } = config;

  return function DocumentConverterTool({ onBack: _onBack }: ToolProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [status, setStatus] = useState<Status>('idle');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    void _onBack;

    // Token de autenticação (se existir)
    const getHeaders = useCallback(() => {
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('accessToken');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return headers;
    }, []);

    const allowedExt = accept.split(',').map((e) => e.trim().toLowerCase());

    const validateFiles = useCallback((list: FileList | File[]): File[] => {
      const arr = Array.from(list);
      return arr.filter((f) => {
        if (!accept) return true;
        const ext = '.' + f.name.split('.').pop()?.toLowerCase();
        return allowedExt.includes(ext);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accept]);

    const handleDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const valid = validateFiles(e.dataTransfer.files);
      if (valid.length === 0) return;
      setFiles(multiple ? valid : [valid[0]]);
      resetState();
    }, [validateFiles, multiple]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const valid = validateFiles(e.target.files);
      if (valid.length === 0) return;
      setFiles(multiple ? valid : [valid[0]]);
      resetState();
    }, [validateFiles, multiple]);

    function resetState() {
      setStatus('idle');
      setProgress(0);
      setMessage('');
      setDownloadUrl(null);
      setFileName(null);
    }

    const handleRemoveFile = useCallback((index: number) => {
      setFiles((prev) => prev.filter((_, i) => i !== index));
      resetState();
    }, []);

    const handleConvert = useCallback(async () => {
      if (files.length < minFiles) return;

      setStatus('uploading');
      setProgress(10);
      setMessage('Enviando arquivo...');

      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));

      const base = apiBase();
      const url = `${base}${endpoint}`;

      try {
        setStatus('processing');
        setProgress(40);
        setMessage('Processando arquivo...');

        const res = await fetch(url, {
          method: 'POST',
          headers: getHeaders(), // sem Content-Type — FormData define multipart boundary
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
          throw new Error(errData.error || `Servidor retornou ${res.status}`);
        }

        setProgress(80);
        setMessage('Preparando download...');

        const blob = await res.blob();
        const url2 = URL.createObjectURL(blob);

        const disposition = res.headers.get('Content-Disposition');
        let name = '';
        if (disposition) {
          const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match) name = match[1].replace(/['"]/g, '');
        }
        if (!name) {
          name =
            files.length === 1
              ? `${getFileNameWithoutExt(files[0].name)}_convertido${outputExt}`
              : `documento_convertido${outputExt}`;
        }

        setDownloadUrl(url2);
        setFileName(name);
        setStatus('success');
        setProgress(100);
        setMessage('Conversão concluída com sucesso!');
      } catch (err) {
        setStatus('error');
        setProgress(0);
        setMessage(err instanceof Error ? err.message : 'Erro ao processar arquivo.');
      }
    }, [files, minFiles, endpoint, getHeaders, outputExt]);

    const handleDownload = useCallback(() => {
      if (downloadUrl && fileName) {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        a.click();
      }
    }, [downloadUrl, fileName]);

    const canConvert = files.length >= minFiles && status === 'idle';

    return (
      <div className="space-y-5">
        {/* Header da ferramenta */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-sm text-[var(--wcag-text-secondary)] max-w-md mx-auto">{description}</p>
        </div>

        {/* Dropzone */}
        {status !== 'success' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300',
              dragOver && files.length === 0
                ? 'border-violet-400 bg-primary/10 scale-[1.02]'
                : files.length > 0
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-white/10 hover:border-violet-400/50 hover:bg-white/[0.02]'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              multiple={multiple}
              className="hidden"
              onChange={handleFileSelect}
            />
            <div
              className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-300',
                files.length > 0 ? 'bg-emerald-500/10' : 'bg-white/5'
              )}
            >
              {files.length > 0 ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              ) : (
                <FileUp className="w-8 h-8 text-[#A1A1AA]" />
              )}
            </div>

            {files.length > 0 ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">
                  {multiple ? `${files.length} arquivos selecionados` : files[0].name}
                </p>
                {!multiple && (
                  <p className="text-xs text-[#A1A1AA]">{formatFileSize(files[0].size)}</p>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-white mb-1">
                  Arraste o arquivo aqui ou clique para selecionar
                </p>
                <p className="text-xs text-[#A1A1AA]">
                  Formatos aceitos: {accept || 'qualquer'}
                  {multiple ? ' (múltiplos arquivos)' : ''}
                </p>
              </>
            )}
          </div>
        )}

        {/* Lista de arquivos */}
        {multiple && files.length > 0 && status === 'idle' && (
          <div className="space-y-2">
            {files.map((file, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileUp className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" />
                  <span className="text-sm text-white truncate">{file.name}</span>
                  <span className="text-xs text-[#A1A1AA] flex-shrink-0">
                    {formatFileSize(file.size)}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveFile(i)}
                  className="p-1 rounded-lg hover:bg-red-500/10 text-[#A1A1AA] hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Botão Converter */}
        {canConvert && (
          <Button
            onClick={handleConvert}
            size="lg"
            className={cn(
              'w-full gap-2 bg-gradient-to-r text-white shadow-lg transition-all hover:opacity-90',
              accent.gradient
            )}
          >
            <Upload className="w-5 h-5" />
            {multiple ? `Mesclar ${files.length} arquivos` : 'Converter Agora'}
          </Button>
        )}

        {/* Status / Progresso */}
        {status !== 'idle' && (
          <div className="space-y-4">
            {(status === 'uploading' || status === 'processing') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#A1A1AA]">{message}</span>
                  <span className="text-primary-light font-medium">{progress}%</span>
                </div>
                <Progress
                  value={progress}
                  className="h-2 bg-white/5 [&>*]:bg-gradient-to-r [&>*]:from-violet-500 [&>*]:to-indigo-500"
                />
                <div className="flex justify-center">
                  <Loader2 className="w-5 h-5 text-primary-light animate-spin" />
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="text-white font-medium mb-1">Conversão concluída!</p>
                  <p className="text-sm text-[#A1A1AA]">Seu arquivo está pronto para download.</p>
                </div>
                {id !== 'merge-pdf' && files.length > 0 && (
                  <Button
                    onClick={() => {
                      setFiles([]);
                      resetState();
                    }}
                    variant="outline"
                    className="border-white/10 text-[#A1A1AA] hover:bg-white/5"
                  >
                    Converter outro arquivo
                  </Button>
                )}
              </div>
            )}

            {status === 'error' && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-300 mb-1">Erro na conversão</p>
                  <p className="text-sm text-red-300/80">{message}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Download */}
        {status === 'success' && downloadUrl && (
          <Button
            onClick={handleDownload}
            size="lg"
            className="w-full gap-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white shadow-lg shadow-emerald-500/20"
          >
            <Download className="w-5 h-5" />
            Baixar Arquivo Convertido
          </Button>
        )}

        {/* Nota de privacidade */}
        <p className="text-xs text-[var(--wcag-text-placeholder)] text-center">
          Seus arquivos são processados de forma segura e não são armazenados após a conversão.
        </p>
      </div>
    );
  };
}
