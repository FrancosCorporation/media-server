// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';

export default function CompoundInterest({ onBack: _onBack }: ToolProps) {
  const [initial, setInitial] = useState(1000);
  const [monthly, setMonthly] = useState(100);
  const [rate, setRate] = useState(1);
  const [period, setPeriod] = useState(12);
  const [rateType, setRateType] = useState<'monthly' | 'yearly'>('monthly');

  const results = useMemo(() => {
    const monthlyRate = rateType === 'yearly' ? rate / 12 / 100 : rate / 100;
    let balance = initial;
    const rows: { month: number; invested: number; interest: number; total: number }[] = [];

    for (let m = 1; m <= period; m++) {
      const interest = balance * monthlyRate;
      balance += interest + monthly;
      rows.push({ month: m, invested: initial + monthly * m, interest: balance - (initial + monthly * m), total: balance });
    }

    return {
      totalInvested: initial + monthly * period,
      totalInterest: balance - (initial + monthly * period),
      finalBalance: balance,
      rows,
    };
  }, [initial, monthly, rate, period, rateType]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Capital Inicial', value: initial, set: setInitial, prefix: 'R$' },
          { label: 'Aporte Mensal', value: monthly, set: setMonthly, prefix: 'R$' },
          { label: `Taxa (${rateType === 'monthly' ? 'mensal' : 'anual'})`, value: rate, set: setRate, prefix: '%' },
          { label: 'Período (meses)', value: period, set: setPeriod, prefix: '' },
        ].map((field) => (
          <div key={field.label}>
            <label className="text-xs text-[#A1A1AA]">{field.label}</label>
            <input type="number" value={field.value} onChange={(e) => field.set(parseFloat(e.target.value) || 0)} min={0}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 mt-1" />
          </div>
        ))}
      </div>
      <button onClick={() => setRateType(rateType === 'monthly' ? 'yearly' : 'monthly')}
        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-[#A1A1AA] hover:text-white transition-all">
        Taxa {rateType === 'monthly' ? 'Anual' : 'Mensal'}
      </button>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Investido', value: results.totalInvested, color: 'text-blue-400' },
          { label: 'Juros Acumulados', value: results.totalInterest, color: 'text-green-400' },
          { label: 'Saldo Final', value: results.finalBalance, color: 'text-primary-light' },
        ].map((stat) => (
          <div key={stat.label} className="p-4 rounded-xl bg-white/[0.03] border border-white/5 text-center">
            <p className="text-xs text-[#A1A1AA]">{stat.label}</p>
            <p className={stat.color + ' text-lg font-bold mt-1'}>R$ {stat.value.toFixed(2)}</p>
          </div>
        ))}
      </div>

      <div className="max-h-60 overflow-y-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[#A1A1AA] text-xs border-b border-white/5">
            <th className="text-left py-2">Mês</th><th className="text-right py-2">Investido</th>
            <th className="text-right py-2">Juros</th><th className="text-right py-2">Total</th>
          </tr></thead>
          <tbody>
            {results.rows.slice(0, 60).map((r) => (
              <tr key={r.month} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-2 text-[#A1A1AA]">{r.month}</td>
                <td className="py-2 text-right text-blue-300">R$ {r.invested.toFixed(2)}</td>
                <td className="py-2 text-right text-green-300">R$ {r.interest.toFixed(2)}</td>
                <td className="py-2 text-right text-white font-medium">R$ {r.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
