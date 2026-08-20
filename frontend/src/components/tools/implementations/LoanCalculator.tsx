// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { cn } from '@/lib/utils';

export default function LoanCalculator({ onBack: _onBack }: ToolProps) {
  const [amount, setAmount] = useState(50000);
  const [rate, setRate] = useState(12);
  const [months, setMonths] = useState(12);
  const [system, setSystem] = useState<'price' | 'sac'>('price');

  const schedule = useMemo(() => {
    const monthlyRate = rate / 100 / 12;
    const rows: { month: number; payment: number; interest: number; amortization: number; balance: number }[] = [];
    if (monthlyRate === 0 || months === 0 || amount === 0) return rows;

    if (system === 'price') {
      const payment = amount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
      let balance = amount;
      for (let i = 1; i <= months; i++) {
        const interest = balance * monthlyRate;
        const amort = payment - interest;
        balance -= amort;
        rows.push({ month: i, payment, interest, amortization: amort, balance: Math.max(0, balance) });
      }
    } else {
      const baseAmort = amount / months;
      let balance = amount;
      for (let i = 1; i <= months; i++) {
        const interest = balance * monthlyRate;
        const amort = baseAmort;
        const payment = amort + interest;
        balance -= amort;
        rows.push({ month: i, payment, interest, amortization: amort, balance: Math.max(0, balance) });
      }
    }
    return rows;
  }, [amount, rate, months, system]);

  const totalPaid = schedule.reduce((sum, r) => sum + r.payment, 0);
  const totalInterest = totalPaid - amount;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Valor do Empréstimo (R$)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Taxa de Juros (% a.a.)</label>
          <input type="number" value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} step="0.1"
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Parcelas (meses)</label>
          <input type="number" value={months} onChange={(e) => setMonths(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Sistema</label>
          <div className="flex gap-2 mt-1">
            <button onClick={() => setSystem('price')}
              data-selected={system === 'price' || undefined}
              className={cn('flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all', 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>PRICE</button>
            <button onClick={() => setSystem('sac')}
              data-selected={system === 'sac' || undefined}
              className={cn('flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all', 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white', 'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white')}>SAC</button>
          </div>
        </div>
      </div>

      {schedule.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
              <p className="text-2xl font-bold text-primary-light">R$ {schedule[0].payment.toFixed(2)}</p>
              <p className="text-xs text-[#A1A1AA]">1ª Parcela</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-2xl font-bold text-amber-400">R$ {totalPaid.toFixed(2)}</p>
              <p className="text-xs text-[#A1A1AA]">Total Pago</p>
            </div>
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
              <p className="text-2xl font-bold text-red-400">R$ {totalInterest.toFixed(2)}</p>
              <p className="text-xs text-[#A1A1AA]">Total em Juros</p>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-white/5">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0D1117]">
                <tr className="text-[10px] uppercase tracking-wider text-[#A1A1AA]/50 border-b border-white/5">
                  <th className="text-left p-3">Mês</th>
                  <th className="text-right p-3">Parcela</th>
                  <th className="text-right p-3">Juros</th>
                  <th className="text-right p-3">Amortização</th>
                  <th className="text-right p-3">Saldo Devedor</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => (
                  <tr key={row.month} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="p-3 text-[#A1A1AA]">{row.month}</td>
                    <td className="p-3 text-right text-white font-mono">R$ {row.payment.toFixed(2)}</td>
                    <td className="p-3 text-right text-amber-400 font-mono">R$ {row.interest.toFixed(2)}</td>
                    <td className="p-3 text-right text-green-400 font-mono">R$ {row.amortization.toFixed(2)}</td>
                    <td className="p-3 text-right text-[#A1A1AA] font-mono">R$ {row.balance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
