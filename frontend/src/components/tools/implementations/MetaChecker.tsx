// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { cn } from '@/lib/utils';

export default function MetaChecker({ onBack: _onBack }: ToolProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const titleStatus = useMemo(() => {
    const len = title.length;
    if (len === 0) return { color: 'bg-gray-500', text: 'Aguardando...', width: 'w-0' };
    if (len < 30) return { color: 'bg-amber-500', text: `Muito curto (${len} chars)`, width: 'w-1/4' };
    if (len <= 60) return { color: 'bg-green-500', text: `Ideal (${len} chars)`, width: 'w-3/4' };
    return { color: 'bg-red-500', text: `Muito longo (${len} chars)`, width: 'w-full' };
  }, [title]);

  const descStatus = useMemo(() => {
    const len = description.length;
    if (len === 0) return { color: 'bg-gray-500', text: 'Aguardando...', width: 'w-0' };
    if (len < 50) return { color: 'bg-amber-500', text: `Muito curta (${len} chars)`, width: 'w-1/4' };
    if (len <= 160) return { color: 'bg-green-500', text: `Ideal (${len} chars)`, width: 'w-3/4' };
    return { color: 'bg-red-500', text: `Muito longa (${len} chars)`, width: 'w-full' };
  }, [description]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Meta Title Preview */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">Meta Title</h3>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70}
          placeholder="Digite o título da página..."
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        <div className="p-4 rounded-xl bg-white rounded-b-none border">
          <p className="text-blue-700 text-sm font-medium truncate">{title || 'Título aparecerá aqui'}</p>
          <p className="text-green-800 text-xs truncate mt-0.5">https://meusite.com/pagina-exemplo</p>
          <p className="text-gray-600 text-xs truncate mt-0.5">{description || 'Descrição aparecerá aqui...'}</p>
        </div>
        <div>
          <div className={cn('h-2 rounded-full transition-all', titleStatus.color, titleStatus.width)} />
          <p className="text-xs text-[#A1A1AA] mt-1">{titleStatus.text}</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-mono text-[#A1A1AA]">{title.length}/60</span>
        </div>
      </div>

      {/* Meta Description Preview */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">Meta Description</h3>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={3}
          placeholder="Descreva o conteúdo da página..."
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 resize-none" />
        <div className="p-4 rounded-xl bg-gray-50 border">
          <p className="text-gray-700 text-sm line-clamp-2">{description || 'Sua meta description será exibida aqui nos resultados de busca do Google. Mantenha entre 50 e 160 caracteres para melhor desempenho.'}</p>
        </div>
        <div>
          <div className={cn('h-2 rounded-full transition-all', descStatus.color, descStatus.width)} />
          <p className="text-xs text-[#A1A1AA] mt-1">{descStatus.text}</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-mono text-[#A1A1AA]">{description.length}/160</span>
        </div>
      </div>
    </div>
  );
}
