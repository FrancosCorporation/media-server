// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import type { ToolProps } from '@/pages/ToolsHub';
import { Upload, Download, Film } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AudioExtractor({ onBack: _onBack }: ToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [format, setFormat] = useState<'mp3' | 'wav'>('wav');
  const videoRef = useRef<HTMLVideoElement>(null);
  

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setAudioUrl(null); }
  }, []);

  const extractAudio = useCallback(async () => {
  if (!file) return;
  setExtracting(true);
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const wavBlob = audioBufferToWav(audioBuffer);
    setAudioUrl(URL.createObjectURL(wavBlob));
  } catch (err) {
    console.error('Erro na extração:', err);
    alert('Não foi possível extrair o áudio deste arquivo.');
  } finally {
    setExtracting(false);
  }
}, [file]);

// Helper to convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer: AudioBuffer) {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numberOfChannels * 2;
  const bufferData = new ArrayBuffer(44 + length);
  const view = new DataView(bufferData);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([bufferData], { type: 'audio/wav' });
}

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex flex-wrap gap-3">
        <label className="px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium cursor-pointer transition-all flex items-center gap-2">
          <Film className="w-4 h-4" /> Selecionar Vídeo MP4
          <input type="file" accept="video/mp4,video/webm" onChange={handleUpload} className="hidden" />
        </label>
        <div className="flex gap-2 items-center">
          {['wav', 'mp3'].map((f) => (
            <button key={f} onClick={() => setFormat(f as any)}
              data-selected={format === f || undefined}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium border transition-all', 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>
              .{f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {file && (
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-3">
          <p className="text-sm text-white">{file.name}</p>
          <p className="text-xs text-[#A1A1AA]">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
          <video ref={videoRef} src={URL.createObjectURL(file)} controls className="w-full rounded-xl max-h-48" />
          <button onClick={extractAudio} disabled={extracting}
            className="w-full px-5 py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-all flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> {extracting ? 'Extraindo áudio...' : `Extrair Áudio (.${format.toUpperCase()})`}
          </button>
        </div>
      )}

      {audioUrl && (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 space-y-3">
          <p className="text-sm text-green-400 font-medium">✅ Áudio extraído com sucesso!</p>
          <audio src={audioUrl} controls className="w-full" />
          <a href={audioUrl} download={`audio_extraido.${format}`}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-all">
            <Download className="w-4 h-4" /> Baixar Áudio
          </a>
        </div>
      )}

      <p className="text-xs text-[#A1A1AA]/50">
        A extração é feita 100% no navegador usando a API HTML5. Suporte: Chrome, Edge, Firefox.
        Vídeos com mais de 30 segundos serão limitados.
      </p>
    </div>
  );
}
