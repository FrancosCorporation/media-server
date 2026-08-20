// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { cn } from '@/lib/utils';

export default function CounterTool({ onBack: _onBack }: ToolProps) {
  const [text, setText] = useState('');

  const stats = useMemo(() => {
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text.split('\n').length;
    const paragraphs = text.split('\n\n').filter((p) => p.trim()).length;
    const readingTimeMin = Math.max(1, Math.ceil(words / 200));
    const readingTimeSec = Math.max(1, Math.ceil((words / 200) * 60));

    return { chars, charsNoSpace, words, lines, paragraphs, readingTimeMin, readingTimeSec };
  }, [text]);

  const items = [
    { label: 'Caracteres', value: stats.chars, color: 'text-blue-400' },
    { label: 'Sem espaços', value: stats.charsNoSpace, color: 'text-cyan-400' },
    { label: 'Palavras', value: stats.words, color: 'text-green-400' },
    { label: 'Linhas', value: stats.lines, color: 'text-amber-400' },
    { label: 'Parágrafos', value: stats.paragraphs, color: 'text-purple-400' },
    { label: 'Tempo de leitura', value: `${stats.readingTimeMin} min`, color: 'text-pink-400' },
  ];

  return (
    <div className="space-y-6">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Digite ou cole seu texto aqui..."
        rows={12}
        className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all resize-y"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {items.map((item) => (
          <div key={item.label} className="p-4 rounded-xl bg-white/[0.03] border border-white/5 text-center">
            <p className={cn('text-2xl font-bold', item.color)}>{item.value}</p>
            <p className="text-xs text-[#A1A1AA] mt-1">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
