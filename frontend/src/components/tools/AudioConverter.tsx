// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import type { ToolProps } from '@/pages/ToolsHub';
import { Upload, Download } from 'lucide-react';

/**
 * Escreve cabeçalho WAV a partir de um AudioBuffer.
 * Totalmente client-side, sem servidor.
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;
  const data = buffer.getChannelData(0);
  const dataLength = data.length * (bitsPerSample / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export default function AudioConverter({ onBack: _onBack }: ToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }, []);

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setConverting(true);
    try {
      audioCtxRef.current = new AudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      const wavBlob = audioBufferToWavBlob(audioBuffer);

      const a = document.createElement('a');
      a.href = URL.createObjectURL(wavBlob);
      a.download = file.name.replace(/\.[^/.]+$/, '') + '.wav';
      a.click();
    } catch (err) {
      console.error('Erro na conversão:', err);
    }
    setConverting(false);
  }, [file]);

  return (
    <div className="space-y-4">
      <label className="inline-flex px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium cursor-pointer transition-all items-center gap-2">
        <Upload className="w-4 h-4" /> Selecionar Arquivo de Áudio
        <input type="file" accept="audio/*" onChange={handleUpload} className="hidden" />
      </label>

      {file && (
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
          <p className="text-sm text-white">{file.name}</p>
          <p className="text-xs text-[#A1A1AA]">{(file.size / 1024).toFixed(1)} KB — {file.type || 'formato desconhecido'}</p>
        </div>
      )}

      {file && (
        <button onClick={handleConvert} disabled={converting}
          className="px-5 py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-all flex items-center gap-2">
          <Download className="w-4 h-4" />
          {converting ? 'Convertendo...' : 'Converter para WAV'}
        </button>
      )}

      <p className="text-xs text-[#A1A1AA]/50">
        A conversão é feita 100% no navegador usando a Web Audio API.
        Nenhum arquivo é enviado para servidores.
      </p>
    </div>
  );
}
