// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';

export default function DiffChecker({ onBack: _onBack }: ToolProps) {
  const [textA, setTextA] = useState('');
  const [textB, setTextB] = useState('');

  const diff = useMemo(() => {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    const maxLen = Math.max(linesA.length, linesB.length);
    const result: { type: 'same' | 'added' | 'removed'; text: string }[] = [];

    for (let i = 0; i < maxLen; i++) {
      const a = linesA[i] || '';
      const b = linesB[i] || '';
      if (a === b) {
        result.push({ type: 'same', text: a || ' ' });
      } else if (!a && b) {
        result.push({ type: 'added', text: b });
      } else if (a && !b) {
        result.push({ type: 'removed', text: a });
      } else {
        result.push({ type: 'removed', text: a });
        result.push({ type: 'added', text: b });
      }
    }
    return result;
  }, [textA, textB]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-[#A1A1AA] mb-2 block">Texto Original</label>
          <textarea value={textA} onChange={(e) => setTextA(e.target.value)} rows={10}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 resize-y"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#A1A1AA] mb-2 block">Texto Modificado</label>
          <textarea value={textB} onChange={(e) => setTextB(e.target.value)} rows={10}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 resize-y"
          />
        </div>
      </div>
      {(textA || textB) && (
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 max-h-60 overflow-y-auto font-mono text-sm leading-relaxed">
          {diff.map((line, i) => (
            <div key={i} className={`px-3 py-0.5 rounded ${line.type === 'added' ? 'bg-green-500/15 text-green-300' : line.type === 'removed' ? 'bg-red-500/15 text-red-300' : 'text-[#A1A1AA]'}`}>
              <span className="mr-2 opacity-50">{i + 1}</span>
              {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
              {line.text || ' '}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
