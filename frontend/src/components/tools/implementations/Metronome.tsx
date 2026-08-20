// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Play, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Metronome({ onBack: _onBack }: ToolProps) {
  const [bpm, setBpm] = useState(120);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playTick = useCallback((isAccent: boolean) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(isAccent ? 1200 : 800, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }, []);

  const startMetronome = useCallback(() => {
    if (playing) return;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    setBeat(0);
    setPlaying(true);

    const interval = 60000 / bpm;
    let count = 0;
    playTick(true);

    intervalRef.current = setInterval(() => {
      count++;
      playTick(count % 4 === 0);
      setBeat(count % 4);
    }, interval);
  }, [bpm, playing, playTick]);

  const stopMetronome = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    audioCtxRef.current?.close();
    setPlaying(false);
    setBeat(0);
  }, []);

  useEffect(() => {
    if (playing) {
      stopMetronome();
      const t = setTimeout(() => startMetronome(), 50);
      return () => clearTimeout(t);
    }
  }, [bpm]);

  useEffect(() => {
    return () => { stopMetronome(); };
  }, [stopMetronome]);

  const getGrid = () => {
    const cells = [];
    for (let i = 0; i < 16; i++) {
      const isAccent = i % 4 === 0;
      const isActive = playing && i % 4 === beat;
      cells.push(
        <div key={i}
          className={cn(
            'w-8 h-8 rounded-lg border transition-all duration-75',
            isActive
              ? (isAccent ? 'bg-violet-500 border-violet-400 scale-110' : 'bg-green-500 border-green-400 scale-110')
              : (isAccent ? 'bg-primary/20 border-primary/30' : 'bg-white/5 border-white/10')
          )}
        />
      );
    }
    return cells;
  };

  return (
    <div className="max-w-lg mx-auto space-y-8 text-center">
      <div>
        <p className="text-6xl font-bold text-white mb-2">{bpm}</p>
        <p className="text-sm text-[#A1A1AA]">Batidas por Minuto</p>
      </div>

      <input type="range" min={30} max={240} value={bpm} onChange={(e) => setBpm(parseInt(e.target.value))}
        className="w-full accent-violet-500" />

      <div className="flex justify-center gap-2 flex-wrap">
        {getGrid()}
      </div>

      <div className="flex justify-center">
        <button onClick={playing ? stopMetronome : startMetronome}
          className={cn('w-20 h-20 rounded-full flex items-center justify-center transition-all', playing ? 'bg-red-500/20 border-4 border-red-500 animate-pulse' : 'bg-primary/20 border-4 border-primary/30 hover:scale-110')}>
          {playing ? <Square className="w-8 h-8 text-red-400" /> : <Play className="w-8 h-8 text-primary-light ml-1" />}
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {[40, 60, 80, 100, 120, 140, 160, 200, 240].map((preset) => (
          <button key={preset} onClick={() => setBpm(preset)}
            data-selected={bpm === preset || undefined}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all', 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
