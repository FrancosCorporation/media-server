// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Mic, Square, Play, Download, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function VoiceRecorder({ onBack: _onBack }: ToolProps) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [permission, setPermission] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermission(true);
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
        setDuration(0);
      };

      recorder.start(100);
      setRecording(true);
      setPaused(false);
      setAudioUrl(null);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      setPermission(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    setPaused(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const togglePause = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      mediaRecorderRef.current.resume();
      setPaused(false);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="max-w-md mx-auto space-y-6 text-center">
      {/* Botão de gravação */}
      <div className="flex justify-center">
        <button
          onClick={recording ? stopRecording : startRecording}
          className={cn(
            'w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300',
            recording
              ? 'bg-red-500/20 border-4 border-red-500 animate-pulse'
              : 'bg-primary/20 border-4 border-primary/30 hover:scale-110'
          )}
        >
          {recording ? (
            <Square className="w-8 h-8 text-red-400" />
          ) : (
            <Mic className="w-8 h-8 text-primary-light" />
          )}
        </button>
      </div>

      {permission === false && (
        <p className="text-sm text-red-400">Permissão do microfone negada. Permita o acesso nas configurações do navegador.</p>
      )}

      {recording && (
        <div className="space-y-4">
          <p className="text-3xl font-mono font-bold text-white">{formatTime(duration)}</p>
          <button onClick={togglePause} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-[#A1A1AA] hover:text-white transition-all flex items-center gap-2 mx-auto">
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {paused ? 'Continuar' : 'Pausar'}
          </button>
        </div>
      )}

      {audioUrl && (
        <div className="space-y-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5">
          <p className="text-sm text-green-400 font-medium">✅ Gravação concluída!</p>
          <audio src={audioUrl} controls className="w-full" />
          <a
            href={audioUrl}
            download={`gravacao_${Date.now()}.webm`}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-all"
          >
            <Download className="w-4 h-4" /> Baixar Gravação
          </a>
        </div>
      )}
    </div>
  );
}
