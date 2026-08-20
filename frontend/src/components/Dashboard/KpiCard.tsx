// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  color: 'violet' | 'indigo' | 'pink' | 'cyan' | 'emerald';
}

const colorClasses = {
  violet: { bg: 'from-primary/20 to-indigo-600/20', text: 'text-primary-light', shadow: 'shadow-primary/10' },
  indigo: { bg: 'from-indigo-600/20 to-blue-600/20', text: 'text-indigo-400', shadow: 'shadow-indigo-500/10' },
  pink: { bg: 'from-pink-600/20 to-rose-600/20', text: 'text-pink-400', shadow: 'shadow-pink-500/10' },
  cyan: { bg: 'from-cyan-600/20 to-teal-600/20', text: 'text-cyan-400', shadow: 'shadow-cyan-500/10' },
  emerald: { bg: 'from-emerald-600/20 to-green-600/20', text: 'text-emerald-400', shadow: 'shadow-emerald-500/10' },
};

export default function KpiCard({ title, value, change, icon: Icon, color }: KpiCardProps) {
  const colors = colorClasses[color];

  return (
    <div className="relative bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl p-6 border border-white/5 hover:border-primary/30 transition-all duration-300 group">
      {/* Header do Card */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#A1A1AA] text-sm font-medium">{title}</h3>
        <div className={`p-2 rounded-xl bg-gradient-to-br ${colors.bg}`}>
          <Icon size={20} className={`${colors.text}`} />
        </div>
      </div>

      {/* Valor Principal */}
      <div className="mb-2">
        <span className="text-3xl font-bold text-white">{value}</span>
      </div>

      {/* Variação */}
      {change !== undefined && (
        <div className={`flex items-center gap-1.5 ${change >= 0 ? 'text-emerald-400' : 'text-red-400'} text-sm`}>
          {change >= 0 ? (
            <ArrowUp size={16} />
          ) : (
            <ArrowDown size={16} />
          )}
          <span className="font-medium">{Math.abs(change)}% desde o mês passado</span>
        </div>
      )}

      {/* Hover Effect */}
      <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ${colors.shadow}`} />
    </div>
  );
}
