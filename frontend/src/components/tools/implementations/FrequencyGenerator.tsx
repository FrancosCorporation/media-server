// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Play, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function FrequencyGenerator({ onBack: _onBack }: ToolProps) {
  const [frequency, setFrequency] = useState(440);
  const [waveType, setWaveType] = useState<OscillatorType>('sine');
  const [volume, setVolume] = useState(0.3);
  const [playing, setPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const startSound = useCallback(() => {
    if (playing) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveType;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    audioCtxRef.current = ctx;
    oscillatorRef.current = osc;
    gainRef.current = gain;
    setPlaying(true);
  }, [frequency, waveType, volume, playing]);

  const stopSound = useCallback(() => {
    if (!playing) return;
    oscillatorRef.current?.stop();
    audioCtxRef.current?.close();
    setPlaying(false);
  }, [playing]);

  const changeFrequency = (freq: number) => {
    setFrequency(freq);
    if (oscillatorRef.current) {
      oscillatorRef.current.frequency.setValueAtTime(freq, audioCtxRef.current!.currentTime);
    }
  };

  const changeVolume = (vol: number) => {
    setVolume(vol);
    if (gainRef.current) {
      gainRef.current.gain.setValueAtTime(vol, audioCtxRef.current!.currentTime);
    }
  };

  const presets = [
    { label: 'Dó (C4)', freq: 261.63 },
    { label: 'Lá (A4)', freq: 440 },
    { label: 'Dó (C5)', freq: 523.25 },
    { label: 'Sub-grave', freq: 60 },
    { label: 'Grave', freq: 100 },
    { label: 'Agudo', freq: 1000 },
    { label: 'Ultrassom', freq: 8000 },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex justify-center gap-3">
        <button onClick={playing ? stopSound : startSound}
          className={cn('w-20 h-20 rounded-full flex items-center justify-center transition-all', playing ? 'bg-red-500/20 border-4 border-red-500 animate-pulse' : 'bg-primary/20 border-4 border-primary/30 hover:scale-110')}>
          {playing ? <Square className="w-8 h-8 text-red-400" /> : <Play className="w-8 h-8 text-primary-light ml-1" />}
        </button>
      </div>

      <div className="text-center">
        <p className="text-4xl font-bold text-white">{frequency} Hz</p>
        <input type="range" min={20} max={10000} value={frequency} onChange={(e) => changeFrequency(parseInt(e.target.value))}
          className="w-full accent-violet-500 mt-2" />
      </div>

      <div className="flex justify-center gap-2">
        {(['sine', 'square', 'sawtooth', 'triangle'] as OscillatorType[]).map((type) => (
          <button key={type} onClick={() => { setWaveType(type); if (oscillatorRef.current) oscillatorRef.current.type = type; }}
            data-selected={waveType === type || undefined}
            className={cn('px-4 py-2 rounded-xl text-sm font-medium border transition-all capitalize', 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>
            {type === 'sine' ? 'Senoide' : type === 'square' ? 'Quadrada' : type === 'sawtooth' ? 'Dente de Serra' : 'Triangular'}
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs text-[#A1A1AA]">Volume: {Math.round(volume * 100)}%</label>
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => changeVolume(parseFloat(e.target.value))}
          className="w-full accent-violet-500" />
      </div>

      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
        <h3 className="text-xs text-[#A1A1AA] mb-3">Frequências Predefinidas</h3>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.freq} onClick={() => changeFrequency(p.freq)}
              data-selected={Math.abs(frequency - p.freq) < 1 || undefined}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all', 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
