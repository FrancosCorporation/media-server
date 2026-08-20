// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Download, Copy, Check, Wifi, Link, Lock } from 'lucide-react';
import QRCodeLib from 'qrcode';
import { cn } from '@/lib/utils';

type QrMode = 'text' | 'wifi';

export default function QrCodeGenerator({ onBack: _onBack }: ToolProps) {
  const [mode, setMode] = useState<QrMode>('text');
  const [text, setText] = useState('https://francoscorp.com');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiAuth, setWifiAuth] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [showPassword, setShowPassword] = useState(false);
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const qrContent = mode === 'text'
    ? text
    : `WIFI:T:${wifiAuth};S:${wifiSsid};P:${wifiPassword};;`;

  useEffect(() => {
    if (canvasRef.current && qrContent.trim()) {
      QRCodeLib.toCanvas(canvasRef.current, qrContent, {
        width: 240,
        color: { dark: fgColor, light: bgColor },
        margin: 2,
      });
    }
  }, [qrContent, fgColor, bgColor]);

  const handleDownload = useCallback(async (format: 'png' | 'svg') => {
    if (!qrContent.trim()) return;
    try {
      if (format === 'png') {
        const canvas = document.createElement('canvas');
        await QRCodeLib.toCanvas(canvas, qrContent, {
          width: 300,
          color: { dark: fgColor, light: bgColor },
          margin: 2,
        });
        const link = document.createElement('a');
        link.download = `qrcode${mode === 'wifi' ? '_wifi' : ''}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const svgContent = await QRCodeLib.toString(qrContent, {
          type: 'svg',
          width: 300,
          color: { dark: fgColor, light: bgColor },
          margin: 2,
        });
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const link = document.createElement('a');
        link.download = `qrcode${mode === 'wifi' ? '_wifi' : ''}.svg`;
        link.href = URL.createObjectURL(blob);
        link.click();
      }
    } catch (err) {
      console.error('Erro ao baixar QR Code:', err);
    }
  }, [qrContent, fgColor, bgColor, mode]);

  const handleCopy = useCallback(async () => {
    if (!qrContent.trim()) return;
    try {
      const canvas = document.createElement('canvas');
      await QRCodeLib.toCanvas(canvas, qrContent, {
        width: 300,
        color: { dark: fgColor, light: bgColor },
        margin: 2,
      });
      canvas.toBlob(async (blob) => {
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      });
    } catch (err) {
      console.error('Erro ao copiar QR Code:', err);
    }
  }, [qrContent, fgColor, bgColor]);

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div className="flex-1 space-y-4 w-full">
        {/* Seletor de modo */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('text')}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2',
              mode === 'text'
                ? 'bg-primary text-white'
                : 'bg-white/5 border border-white/10 text-[#A1A1AA] hover:bg-white/10'
            )}>
            <Link className="w-4 h-4" /> Link / Texto
          </button>
          <button
            onClick={() => setMode('wifi')}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2',
              mode === 'wifi'
                ? 'bg-primary text-white'
                : 'bg-white/5 border border-white/10 text-[#A1A1AA] hover:bg-white/10'
            )}>
            <Wifi className="w-4 h-4" /> Senha WiFi
          </button>
        </div>

        {/* Campos de entrada */}
        {mode === 'text' ? (
          <div>
            <label className="text-xs text-[#A1A1AA] mb-1 block">Conteudo do QR Code</label>
            <input type="text" value={text} onChange={(e) => setText(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[#A1A1AA] mb-1 block">Nome da Rede (SSID)</label>
              <input type="text" value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)}
                placeholder="Ex: MinhaRede"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 placeholder:text-[#A1A1AA]/30" />
            </div>
            <div>
              <label className="text-xs text-[#A1A1AA] mb-1 block">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  placeholder="Senha da rede"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 placeholder:text-[#A1A1AA]/30" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white transition-colors">
                  <Lock className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-[#A1A1AA] mb-1 block">Tipo de Seguranca</label>
              <select
                value={wifiAuth}
                onChange={(e) => setWifiAuth(e.target.value as 'WPA' | 'WEP' | 'nopass')}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50">
                <option value="WPA">WPA/WPA2/WPA3</option>
                <option value="WEP">WEP</option>
                <option value="nopass">Sem senha (Aberta)</option>
              </select>
            </div>
            <p className="text-xs text-[#A1A1AA]/50">
              Ao escanear, seu celular conecta automaticamente a rede WiFi
            </p>
          </div>
        )}

        {/* Cores */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#A1A1AA] mb-1 block">Cor de Preenchimento</label>
            <input type="color" value={fgColor} onChange={(e) => setFgColor(e.target.value)}
              className="w-full h-10 rounded-xl bg-white/5 border border-white/10 cursor-pointer" />
          </div>
          <div>
            <label className="text-xs text-[#A1A1AA] mb-1 block">Cor de Fundo</label>
            <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
              className="w-full h-10 rounded-xl bg-white/5 border border-white/10 cursor-pointer" />
          </div>
        </div>

        {/* Botões de ação */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleDownload('png')}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all flex items-center gap-2">
            <Download className="w-4 h-4" /> PNG
          </button>
          <button onClick={() => handleDownload('svg')}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-all flex items-center gap-2">
            <Download className="w-4 h-4" /> SVG
          </button>
          <button onClick={handleCopy}
            className={cn('px-4 py-2 rounded-xl border text-sm font-medium transition-all flex items-center gap-2', copied ? 'border-green-500/30 text-green-400' : 'border-white/10 text-[#A1A1AA] hover:bg-white/5')}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-shrink-0 flex flex-col items-center gap-3">
        <canvas ref={canvasRef} width={240} height={240}
          className="rounded-2xl border border-white/10 shadow-lg" />
        <p className="text-xs text-[#A1A1AA]/50">
          {mode === 'wifi' ? 'QR Code WiFi - Escaneie para conectar' : 'QR Code gerado via qrcode'}
        </p>
      </div>
    </div>
  );
}
