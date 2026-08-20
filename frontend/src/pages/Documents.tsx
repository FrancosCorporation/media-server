// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import {
  FileText,
  File,
  Combine,
  Scissors,
  QrCode,
  Upload,
  X,
  Download,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  FileUp,
  Wifi,
  Link,
  Lock,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { QRCodeCanvas } from 'qrcode.react';
import QRCodeLib from 'qrcode';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AdBanner } from '@/components/AdBanner';
import { apiBase } from '@/lib/api';
import ToolPageLayout from '@/components/tools/ToolPageLayout';
import { cn } from '@/lib/utils';

type ToolId = 'pdf-to-word' | 'word-to-pdf' | 'merge-pdf' | 'split-pdf' | 'qrcode';

interface Tool {
  id: ToolId;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  accept: string;
  endpoint: string;
  multiple?: boolean;
}

interface ConversionState {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  progress: number;
  message: string;
  downloadUrl: string | null;
  fileName: string | null;
}

const TOOLS: Tool[] = [
  {
    id: 'pdf-to-word',
    title: 'PDF para Word',
    description: 'Converta seus arquivos PDF em documentos .docx editáveis.',
    icon: FileText,
    color: 'blue',
    accept: '.pdf',
    endpoint: '/documents/pdf-to-word',
  },
  {
    id: 'word-to-pdf',
    title: 'Word para PDF',
    description: 'Transforme arquivos .docx em PDFs profissionais.',
    icon: File,
    color: 'red',
    accept: '.docx',
    endpoint: '/documents/word-to-pdf',
  },
  {
    id: 'merge-pdf',
    title: 'Mesclar PDFs',
    description: 'Agrupe múltiplos PDFs em um único documento.',
    icon: Combine,
    color: 'purple',
    accept: '.pdf',
    endpoint: '/documents/merge-pdf',
    multiple: true,
  },
  {
    id: 'split-pdf',
    title: 'Dividir PDF',
    description: 'Extraia páginas específicas ou divida um PDF em partes.',
    icon: Scissors,
    color: 'orange',
    accept: '.pdf',
    endpoint: '/documents/split-pdf',
  },
  {
    id: 'qrcode',
    title: 'Gerador de QR Code',
    description: 'Crie QR Codes personalizados para links, textos, redes sociais ou senhas WiFi.',
    icon: QrCode,
    color: 'emerald',
    accept: '',
    endpoint: '',
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; hoverGlow: string; shadow: string; gradient: string }> = {
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    hoverGlow: 'hover:shadow-blue-500/10',
    shadow: 'shadow-blue-500/20',
    gradient: 'from-blue-600 to-indigo-600',
  },
  red: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    hoverGlow: 'hover:shadow-red-500/10',
    shadow: 'shadow-red-500/20',
    gradient: 'from-red-600 to-rose-600',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    text: 'text-purple-400',
    hoverGlow: 'hover:shadow-purple-500/10',
    shadow: 'shadow-purple-500/20',
    gradient: 'from-purple-600 to-violet-600',
  },
  orange: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    text: 'text-orange-400',
    hoverGlow: 'hover:shadow-orange-500/10',
    shadow: 'shadow-orange-500/20',
    gradient: 'from-orange-600 to-amber-600',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    hoverGlow: 'hover:shadow-emerald-500/10',
    shadow: 'shadow-emerald-500/20',
    gradient: 'from-emerald-600 to-green-600',
  },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileNameWithoutExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

const MAX_FILE_SIZE = 30 * 1024 * 1024;

interface DocumentsProps {
  standalone?: boolean;
  onBack?: () => void;
}

export default function Documents({ standalone = false, onBack }: DocumentsProps) {
  void onBack;

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [conv, setConv] = useState<ConversionState>({
    status: 'idle',
    progress: 0,
    message: '',
    downloadUrl: null,
    fileName: null,
  });
  const [fileError, setFileError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectTool = useCallback((tool: Tool) => {
    setSelectedTool(tool);
    setFiles([]);
    setFileError(null);
    setConv({ status: 'idle', progress: 0, message: '', downloadUrl: null, fileName: null });
  }, []);

  const handleCloseDialog = useCallback(() => {
    setSelectedTool(null);
    setFiles([]);
    setFileError(null);
    setConv({ status: 'idle', progress: 0, message: '', downloadUrl: null, fileName: null });
  }, []);

  const validateFiles = useCallback(
    (newFiles: FileList | File[]): File[] => {
      if (!selectedTool) return [];
      const arr = Array.from(newFiles);
      const allowedExt = selectedTool.accept.split(',').map((e) => e.trim().toLowerCase());
      const valid: File[] = [];
      for (const f of arr) {
        if (f.size > MAX_FILE_SIZE) {
          setFileError(`Arquivo muito grande (${formatFileSize(f.size)}). Limite: 30MB.`);
          continue;
        }
        const ext = '.' + f.name.split('.').pop()?.toLowerCase();
        if (allowedExt.includes(ext)) {
          valid.push(f);
        } else {
          setFileError(`Formato não suportado: ${f.name}`);
        }
      }
      return valid;
    },
    [selectedTool]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      setFileError(null);
      if (!selectedTool) return;
      const valid = validateFiles(e.dataTransfer.files);
      if (valid.length === 0) return;
      setFiles(selectedTool.multiple ? valid : [valid[0]]);
      setConv({ status: 'idle', progress: 0, message: '', downloadUrl: null, fileName: null });
    },
    [selectedTool, validateFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFileError(null);
      if (!selectedTool || !e.target.files) return;
      const valid = validateFiles(e.target.files);
      if (valid.length === 0) return;
      setFiles(selectedTool.multiple ? valid : [valid[0]]);
      setConv({ status: 'idle', progress: 0, message: '', downloadUrl: null, fileName: null });
    },
    [selectedTool, validateFiles]
  );

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError(null);
  }, []);

  const handleConvert = useCallback(async () => {
    if (!selectedTool || files.length === 0) return;

    setConv({ status: 'uploading', progress: 10, message: 'Enviando arquivo...', downloadUrl: null, fileName: null });

    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));

    const base = apiBase();
    const url = `${base}${selectedTool.endpoint}`;

    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      setConv((prev) => ({ ...prev, status: 'processing', progress: 40, message: 'Processando arquivo...' }));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errData.error || `Servidor retornou ${res.status}`);
      }

      setConv((prev) => ({ ...prev, progress: 80, message: 'Preparando download...' }));

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);

      const disposition = res.headers.get('Content-Disposition');
      let fileName = '';
      if (disposition) {
        const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) fileName = match[1].replace(/['"]/g, '');
      }
      if (!fileName) {
        const ext = selectedTool.id === 'pdf-to-word' ? '.docx' : '.pdf';
        fileName = files.length === 1
          ? `${getFileNameWithoutExt(files[0].name)}_convertido${ext}`
          : `documento_convertido${ext}`;
      }

      setConv({
        status: 'success',
        progress: 100,
        message: 'Conversão concluída com sucesso!',
        downloadUrl,
        fileName,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setConv({
          status: 'error',
          progress: 0,
          message: 'Tempo limite excedido. O servidor pode estar offline.',
          downloadUrl: null,
          fileName: null,
        });
      } else {
        setConv({
          status: 'error',
          progress: 0,
          message: err instanceof Error ? err.message : 'Erro ao processar arquivo.',
          downloadUrl: null,
          fileName: null,
        });
      }
    }
  }, [selectedTool, files]);

  const handleDownload = useCallback(() => {
    if (conv.downloadUrl && conv.fileName) {
      const a = document.createElement('a');
      a.href = conv.downloadUrl;
      a.download = conv.fileName;
      a.click();
    }
  }, [conv.downloadUrl, conv.fileName]);

  const renderToolCard = (tool: Tool) => {
    const colors = COLOR_MAP[tool.color];
    const Icon = tool.icon;

    return (
      <button
        key={tool.id}
        onClick={() => handleSelectTool(tool)}
        className={cn(
          'group relative w-full text-left',
          'rounded-2xl border p-6 transition-all duration-300',
          'hover:scale-[1.02] active:scale-[0.98]',
          colors.border,
          colors.bg,
          colors.hoverGlow,
          'shadow-lg'
        )}
        style={{
          background: `linear-gradient(135deg, rgba(15,23,42,0.8) 0%, rgba(15,23,42,0.4) 100%)`,
          backdropFilter: 'blur(20px)',
        }}
      >
        <div
          className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center mb-5',
            'transition-transform duration-300 group-hover:scale-110',
            colors.bg,
            colors.border,
            'border'
          )}
        >
          <Icon className={cn('w-7 h-7', colors.text)} />
        </div>

        <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-gradient-violet transition-all">
          {tool.title}
        </h3>

        <p className="text-sm text-[#A1A1AA] leading-relaxed">
          {tool.description}
        </p>

        <div className={cn(
          'absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-300',
          colors.bg
        )}>
          <ArrowLeft className={cn('w-4 h-4 rotate-[135deg]', colors.text)} />
        </div>
      </button>
    );
  };

  const renderDropzone = () => {
    if (!selectedTool) return null;

    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center',
          'transition-all duration-300',
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
          accept={selectedTool.accept}
          multiple={selectedTool.multiple}
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4',
          'transition-all duration-300',
          files.length > 0 ? 'bg-emerald-500/10' : 'bg-white/5'
        )}>
          {files.length > 0 ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          ) : (
            <FileUp className="w-8 h-8 text-[#A1A1AA]" />
          )}
        </div>

        {files.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-white">
              {selectedTool.multiple
                ? `${files.length} arquivos selecionados`
                : files[0].name}
            </p>
            {!selectedTool.multiple && (
              <p className="text-xs text-[#A1A1AA]">{formatFileSize(files[0].size)}</p>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-white mb-1">
              Arraste o arquivo aqui ou clique para selecionar
            </p>
            <p className="text-xs text-[#A1A1AA]">
              Formatos aceitos: {selectedTool.accept}
              {selectedTool.multiple ? ' (múltiplos arquivos)' : ''}
            </p>
          </>
        )}
      </div>
    );
  };

  const renderSelectedFiles = () => {
    if (!selectedTool || files.length <= (selectedTool.multiple ? 0 : 1)) return null;

    return (
      <div className="space-y-2">
        {files.map((file, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" />
              <span className="text-sm text-white truncate">{file.name}</span>
              <span className="text-xs text-[#A1A1AA] flex-shrink-0">
                {formatFileSize(file.size)}
              </span>
            </div>
            {conv.status === 'idle' && (
              <button
                onClick={() => handleRemoveFile(i)}
                className="p-1 rounded-lg hover:bg-red-500/10 text-[#A1A1AA] hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderStatus = () => {
    if (conv.status === 'idle') return null;

    return (
      <div className="space-y-4">
        {(conv.status === 'uploading' || conv.status === 'processing') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#A1A1AA]">{conv.message}</span>
              <span className="text-primary-light font-medium">{conv.progress}%</span>
            </div>
            <Progress
              value={conv.progress}
              className="h-2 bg-white/5 [&>*]:bg-gradient-to-r [&>*]:from-violet-500 [&>*]:to-indigo-500"
            />
          </div>
        )}

        {(conv.status === 'uploading' || conv.status === 'processing') && (
          <div className="flex justify-center">
            <LoadingSpinner size="sm" variant="violet" label={conv.message} />
          </div>
        )}

        {conv.status === 'success' && (
          <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium mb-1">Conversão concluída!</p>
              <p className="text-sm text-[#A1A1AA]">
                Seu arquivo está pronto para download.
              </p>
            </div>
            <Button
              onClick={handleDownload}
              size="lg"
              className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white shadow-lg shadow-emerald-500/20 gap-2"
            >
              <Download className="w-5 h-5" />
              Baixar Arquivo Convertido
            </Button>
          </div>
        )}

        {conv.status === 'error' && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300 mb-1">Erro na conversão</p>
              <p className="text-sm text-red-300/80">{conv.message}</p>
              <p className="text-xs text-red-300/50 mt-1">
                Verifique se o servidor está rodando em {apiBase().replace('/api', '')} e tente novamente.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const [qrText, setQrText] = useState('https://francoscorporation.ddns.net');
  const [qrFgColor, setQrFgColor] = useState('#7C3AED');
  const [qrBgColor, setQrBgColor] = useState('#0D1117');
  const [qrSize, setQrSize] = useState(300);
  const [qrMode, setQrMode] = useState<'text' | 'wifi'>('text');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiAuth, setWifiAuth] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [showWifiPassword, setShowWifiPassword] = useState(false);

  const wifiQrContent = `WIFI:T:${wifiAuth};S:${wifiSsid};P:${wifiPassword};;`;

  const qrContent = qrMode === 'text' ? qrText : wifiQrContent;

  const handleDownloadPNG = useCallback(async () => {
    if (!qrContent.trim()) return;
    try {
      const canvas = document.createElement('canvas');
      await QRCodeLib.toCanvas(canvas, qrContent, {
        width: qrSize,
        color: { dark: qrFgColor, light: qrBgColor },
        margin: 2,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `qrcode${qrMode === 'wifi' ? '_wifi' : ''}_${Date.now()}.png`;
      a.click();
    } catch (err) {
      console.error('Erro ao gerar QR Code PNG:', err);
    }
  }, [qrContent, qrSize, qrFgColor, qrBgColor, qrMode]);

  const handleDownloadSVG = useCallback(async () => {
    if (!qrContent.trim()) return;
    try {
      const svgString = await QRCodeLib.toString(qrContent, {
        type: 'svg',
        width: qrSize,
        color: { dark: qrFgColor, light: qrBgColor },
        margin: 2,
      });
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qrcode${qrMode === 'wifi' ? '_wifi' : ''}_${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao gerar QR Code SVG:', err);
    }
  }, [qrContent, qrSize, qrFgColor, qrBgColor, qrMode]);

  const handleCopyQR = useCallback(async () => {
    if (!qrContent.trim()) return;
    try {
      const canvas = document.createElement('canvas');
      await QRCodeLib.toCanvas(canvas, qrContent, {
        width: qrSize,
        color: { dark: qrFgColor, light: qrBgColor },
        margin: 2,
      });
      canvas.toBlob(async (blob) => {
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }
      });
    } catch (err) {
      console.error('Erro ao copiar QR Code:', err);
    }
  }, [qrContent, qrSize, qrFgColor, qrBgColor]);

  const renderQrCodeDialog = () => {
    if (!selectedTool || selectedTool.id !== 'qrcode') return null;
    const colors = COLOR_MAP[selectedTool.color];
    const Icon = selectedTool.icon;

    return (
      <Dialog open={!!selectedTool} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="md:max-w-3xl lg:max-w-4xl bg-[#0B0F1A]/95 backdrop-blur-xl border-white/5 text-white max-h-[90vh] overflow-y-auto p-5 md:p-6">
          <DialogHeader>
            <div className="flex items-center gap-4 mb-2">
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', colors.bg, colors.border, 'border')}>
                <Icon className={cn('w-6 h-6', colors.text)} />
              </div>
              <div>
                <DialogTitle className="text-xl text-white">
                  Gerador de QR Code
                </DialogTitle>
                <DialogDescription className="text-[#A1A1AA] text-sm mt-1">
                  Crie QR Codes personalizados para links, textos ou senhas WiFi.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 py-2 md:py-4">
            <div className="flex flex-col items-center gap-4 lg:w-[320px] flex-shrink-0">
              <div
                className="rounded-2xl p-4 border border-white/5"
                style={{
                  background: qrBgColor,
                  boxShadow: '0 0 40px rgba(124,58,237,0.1)',
                }}
              >
                {qrContent.trim() ? (
                  <QRCodeCanvas
                    value={qrContent}
                    size={qrSize}
                    fgColor={qrFgColor}
                    bgColor={qrBgColor}
                    level="M"
                    style={{ display: 'block' }}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center"
                    style={{ width: qrSize, height: qrSize }}
                  >
                    <QrCode className="w-16 h-16 text-white/20" />
                  </div>
                )}
              </div>

              <div className="flex gap-3 w-full">
                <Button
                  onClick={handleDownloadPNG}
                  disabled={!qrContent.trim()}
                  variant="outline"
                  className="flex-1 gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                >
                  <Download className="w-4 h-4" />
                  PNG
                </Button>
                <Button
                  onClick={handleDownloadSVG}
                  disabled={!qrContent.trim()}
                  variant="outline"
                  className="flex-1 gap-2 border-primary/30 text-primary-light hover:bg-primary/10 hover:text-primary-light/80"
                >
                  <Download className="w-4 h-4" />
                  SVG
                </Button>
                <Button
                  onClick={handleCopyQR}
                  disabled={!qrContent.trim()}
                  variant="outline"
                  className="flex-1 gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                >
                  Copiar
                </Button>
              </div>

              <AdBanner variant="rectangle" className="mt-4" />
            </div>

            <div className="flex-1 space-y-5">
              {/* Seletor de modo */}
              <div className="flex gap-2">
                <button
                  onClick={() => setQrMode('text')}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2',
                    qrMode === 'text'
                      ? 'bg-primary text-white'
                      : 'bg-white/5 border border-white/10 text-[#A1A1AA] hover:bg-white/10'
                  )}>
                  <Link className="w-4 h-4" /> Link / Texto
                </button>
                <button
                  onClick={() => setQrMode('wifi')}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2',
                    qrMode === 'wifi'
                      ? 'bg-primary text-white'
                      : 'bg-white/5 border border-white/10 text-[#A1A1AA] hover:bg-white/10'
                  )}>
                  <Wifi className="w-4 h-4" /> Senha WiFi
                </button>
              </div>

              {qrMode === 'text' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#A1A1AA]">
                    Texto ou URL
                  </label>
                  <input
                    type="text"
                    value={qrText}
                    onChange={(e) => setQrText(e.target.value)}
                    placeholder="https://exemplo.com ou texto qualquer..."
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#A1A1AA]">
                      Nome da Rede (SSID)
                    </label>
                    <input
                      type="text"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                      placeholder="Ex: MinhaRede"
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#A1A1AA]">
                      Senha
                    </label>
                    <div className="relative">
                      <input
                        type={showWifiPassword ? 'text' : 'password'}
                        value={wifiPassword}
                        onChange={(e) => setWifiPassword(e.target.value)}
                        placeholder="Senha da rede"
                        className="w-full px-4 py-3 pr-10 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowWifiPassword(!showWifiPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white transition-colors">
                        <Lock className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#A1A1AA]">
                      Tipo de Seguranca
                    </label>
                    <select
                      value={wifiAuth}
                      onChange={(e) => setWifiAuth(e.target.value as 'WPA' | 'WEP' | 'nopass')}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all">
                      <option value="WPA">WPA/WPA2/WPA3</option>
                      <option value="WEP">WEP</option>
                      <option value="nopass">Sem senha (Aberta)</option>
                    </select>
                  </div>
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                    <p className="text-xs text-[#A1A1AA] leading-relaxed">
                      Ao escanear, seu celular conecta automaticamente a rede WiFi
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-[#A1A1AA]">
                  Cor do QR Code
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="color"
                    value={qrFgColor}
                    onChange={(e) => setQrFgColor(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                  />
                  <span className="text-xs text-[#A1A1AA] font-mono">{qrFgColor}</span>
                  {['#7C3AED', '#0EA5E9', '#10B981', '#EF4444', '#F59E0B', '#FFFFFF'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setQrFgColor(c)}
                      className={cn(
                        'w-7 h-7 rounded-full border-2 transition-all',
                        qrFgColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-110'
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[#A1A1AA]">
                  Cor do Fundo
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="color"
                    value={qrBgColor}
                    onChange={(e) => setQrBgColor(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                  />
                  <span className="text-xs text-[#A1A1AA] font-mono">{qrBgColor}</span>
                  {['#0D1117', '#1E293B', '#FFFFFF', '#000000', '#0F172A'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setQrBgColor(c)}
                      className={cn(
                        'w-7 h-7 rounded-full border-2 transition-all',
                        qrBgColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-110'
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[#A1A1AA]">
                  Tamanho: <span className="text-white font-semibold">{qrSize}px</span>
                </label>
                <div className="flex gap-2">
                  {[200, 300, 400].map((s) => (
                    <button
                      key={s}
                      onClick={() => setQrSize(s)}
                      data-selected={qrSize === s || undefined}
                      className={cn(
                        'flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
                        'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white',
                        'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white'
                      )}
                    >
                      {s}px
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  O QR Code é atualizado em tempo real conforme você digita.
                  Use as cores para personalizar e baixe em PNG ou SVG.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const renderFileDialog = () => {
    if (!selectedTool || selectedTool.id === 'qrcode') return null;

    const colors = COLOR_MAP[selectedTool.color];
    const Icon = selectedTool.icon;
    const canConvert = files.length > 0 && conv.status === 'idle' && !fileError;

    return (
      <Dialog open={!!selectedTool} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-2xl bg-[#0B0F1A]/95 backdrop-blur-xl border-white/5 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-4 mb-2">
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', colors.bg, colors.border, 'border')}>
                <Icon className={cn('w-6 h-6', colors.text)} />
              </div>
              <div>
                <DialogTitle className="text-xl text-white">
                  {selectedTool.title}
                </DialogTitle>
                <DialogDescription className="text-[#A1A1AA] text-sm mt-1">
                  {selectedTool.description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {conv.status !== 'success' && renderDropzone()}

            {fileError && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{fileError}</p>
              </div>
            )}

            {renderSelectedFiles()}

            {canConvert && (
              <Button
                onClick={handleConvert}
                size="lg"
                className={cn(
                  'w-full gap-2 bg-gradient-to-r text-white shadow-lg',
                  colors.gradient,
                  colors.shadow,
                  'hover:opacity-90 transition-all'
                )}
              >
                <Upload className="w-5 h-5" />
                Converter Agora
              </Button>
            )}

            {renderStatus()}

            {conv.status === 'idle' && !fileError && (
              <div className="flex justify-center pt-2">
                <AdBanner variant="rectangle" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const renderContent = () => (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        {TOOLS.map(renderToolCard)}
      </div>

      {renderQrCodeDialog()}
      {renderFileDialog()}
    </>
  );

  if (standalone) {
    return renderContent();
  }

  return (
    <ToolPageLayout>
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary-light text-xs font-medium mb-4">
          <FileText className="w-3.5 h-3.5" />
          Ferramentas Grátis
        </div>
        <h1 className="font-display text-4xl sm:text-5xl font-bold mb-4">
          <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-pink-400 bg-clip-text text-transparent">
            Documentos
          </span>
        </h1>
        <p className="text-[#A1A1AA] text-lg max-w-2xl mx-auto leading-relaxed">
          Ferramentas de documentos 100% grátis. Converta, mescle e divida PDFs
          e Word diretamente do seu navegador, sem instalar nada.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
        {TOOLS.map(renderToolCard)}
      </div>

      <div className="max-w-2xl mx-auto text-center mb-6">
        <p className="text-xs text-[#A1A1AA]/50 leading-relaxed">
          Seus arquivos são processados de forma segura e não são armazenados
          em nossos servidores após a conversão. Respeitamos sua privacidade.
        </p>
      </div>

      {renderQrCodeDialog()}
      {renderFileDialog()}
    </ToolPageLayout>
  );
}
