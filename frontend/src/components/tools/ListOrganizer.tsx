// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { cn } from '@/lib/utils';

export default function ListOrganizer({ onBack: _onBack }: ToolProps) {
  const [text, setText] = useState('');

  const items = useMemo(() => text.split('\n').filter((l) => l.trim()), [text]);

  const apply = (type: string) => {
    let list = [...items];
    switch (type) {
      case 'dedup': list = [...new Set(list)]; break;
      case 'sort-asc': list.sort((a, b) => a.localeCompare(b, 'pt-BR')); break;
      case 'sort-desc': list.sort((a, b) => b.localeCompare(a, 'pt-BR')); break;
      case 'reverse': list.reverse(); break;
      case 'number': list = list.map((item, i) => `${i + 1}. ${item}`); break;
    }
    setText(list.join('\n'));
  };

  return (
    <div className="space-y-4">
      <textarea value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Digite um item por linha..."
        rows={10}
        className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 resize-y"
      />
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'dedup', label: 'Remover Duplicados' },
          { key: 'sort-asc', label: 'Ordenar A → Z' },
          { key: 'sort-desc', label: 'Ordenar Z → A' },
          { key: 'reverse', label: 'Inverter Ordem' },
          { key: 'number', label: 'Adicionar Numeração' },
        ].map((btn) => (
          <button key={btn.key} onClick={() => apply(btn.key)}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-[#A1A1AA] hover:bg-primary/10 hover:text-primary-light hover:border-primary/20 transition-all"
          >
            {btn.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-[#A1A1AA]/50">{items.length} item(ns)</p>
    </div>
  );
}
