// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';

export default function ProfitMarginCalculator({ onBack: _onBack }: ToolProps) {
  const [cost, setCost] = useState(50);
  const [tax, setTax] = useState(12);
  const [margin, setMargin] = useState(30);
  const [sellPrice, setSellPrice] = useState<number | null>(null);

  const results = useMemo(() => {
    if (cost <= 0) return null;
    const taxPercent = tax / 100;
    const marginPercent = margin / 100;
    const price = cost / (1 - taxPercent - marginPercent);
    return {
      sellPrice: price,
      profit: price - cost - (price * taxPercent),
      taxValue: price * taxPercent,
      markup: ((price - cost) / cost) * 100,
    };
  }, [cost, tax, margin]);

  const calcByPrice = () => {
    if (sellPrice === null || sellPrice <= 0 || cost <= 0) return;
    const actualMargin = ((sellPrice - cost - (sellPrice * (tax / 100))) / sellPrice) * 100;
    setMargin(Math.round(actualMargin * 10) / 10);
  };

  const formatCurrency = (v: number) => `R$ ${v.toFixed(2)}`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">Calcular Preço de Venda</h3>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Custo do Produto (R$)</label>
          <input type="number" value={cost} onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Impostos (%)</label>
          <input type="number" value={tax} onChange={(e) => setTax(parseFloat(e.target.value) || 0)} step="0.5"
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Margem Desejada (%)</label>
          <input type="number" value={margin} onChange={(e) => setMargin(parseFloat(e.target.value) || 0)} step="0.5"
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">Resultados</h3>
        {results && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
              <p className="text-3xl font-bold text-primary-light">{formatCurrency(results.sellPrice)}</p>
              <p className="text-xs text-[#A1A1AA]">Preço de Venda Sugerido</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                <p className="text-lg font-bold text-green-400">{formatCurrency(results.profit)}</p>
                <p className="text-xs text-[#A1A1AA]">Lucro Líquido</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <p className="text-lg font-bold text-amber-400">{results.markup.toFixed(1)}%</p>
                <p className="text-xs text-[#A1A1AA]">Markup</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-[#A1A1AA]">Impostos: <strong className="text-red-400">{formatCurrency(results.taxValue)}</strong></p>
              <div className="w-full h-2 rounded-full bg-white/5 mt-2 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500"
                  style={{ width: `${Math.min(100, (margin + tax))}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-[#A1A1AA]/50 mt-1">
                <span>Custo: {(cost / results.sellPrice * 100).toFixed(0)}%</span>
                <span>Lucro: {margin.toFixed(0)}%</span>
                <span>Impostos: {tax.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="md:col-span-2 p-4 rounded-xl bg-white/[0.03] border border-white/5">
        <h3 className="text-sm font-semibold text-white mb-3">Calcular Margem a partir do Preço</h3>
        <div className="flex gap-3">
          <input type="number" value={sellPrice ?? ''} onChange={(e) => setSellPrice(parseFloat(e.target.value) || null)}
            placeholder="Preço de venda praticado (R$)"
            className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          <button onClick={calcByPrice}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all">
            Calcular Margem
          </button>
        </div>
      </div>
    </div>
  );
}
