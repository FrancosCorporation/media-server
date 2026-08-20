// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';

export default function KeywordDensity({ onBack: _onBack }: ToolProps) {
  const [text, setText] = useState('');

  const words = useMemo(() => {
    if (!text.trim()) return [];
    const clean = text.toLowerCase().replace(/[^a-záàâãéèêíïóôõöúçñ\s]/g, '');
    const wordList = clean.split(/\s+/).filter(w => w.length > 2);
    const freq: Record<string, number> = {};
    wordList.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    return Object.entries(freq)
      .map(([word, count]) => ({ word, count, density: (count / wordList.length) * 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
  }, [text]);

  const totalWords = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-4">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
        placeholder="Cole seu texto para analisar a densidade de palavras-chave..."
        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 resize-y" />
      
      {words.length > 0 && (
        <>
          <p className="text-sm text-[#A1A1AA]">Total de palavras: <strong className="text-white">{totalWords}</strong> | Palavras únicas: <strong className="text-white">{words.length}</strong></p>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {words.map((w) => (
              <div key={w.word} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.02]">
                <span className="text-sm text-white flex-1">{w.word}</span>
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, w.density * 5)}%` }} />
                </div>
                <span className="text-xs text-[#A1A1AA] w-16 text-right">{w.count}x</span>
                <span className="text-xs text-primary-light w-16 text-right">{w.density.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
