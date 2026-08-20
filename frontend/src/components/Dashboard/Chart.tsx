// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface ChartData {
  name: string;
  revenue: number;
  sales: number;
  visitors: number;
}

interface ChartProps {
  data: ChartData[];
  title?: string;
  height?: number;
}

const chartColors = {
  primary: '#8B5CF6', // violet-500
  secondary: '#6366F1', // indigo-500
  grid: '#334155', // slate-700
  text: '#94A3B8', // slate-400
};

export default function Chart({ data, title = 'Visão Geral de Vendas', height = 300 }: ChartProps) {
  return (
    <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl p-6 border border-white/5">
      {/* Header do Gráfico */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        
        {/* Legendas */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gradient-to-r from-primary to-indigo-600" />
            <span className="text-sm text-[#A1A1AA]">Receita</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600" />
            <span className="text-sm text-[#A1A1AA]">Vendas</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gradient-to-r from-cyan-600 to-teal-600" />
            <span className="text-sm text-[#A1A1AA]">Visitantes</span>
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <div style={{ height: `${height}px` }}>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            {/* Grid */}
            <CartesianGrid 
              stroke={chartColors.grid} 
              strokeDasharray="3 3" 
              vertical={false}
            />

            {/* Eixos */}
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false}
              tick={{ fill: chartColors.text, fontSize: 12 }}
              dy={10}
            />
            
            <YAxis 
              axisLine={false} 
              tickLine={false}
              tick={{ fill: chartColors.text, fontSize: 12 }}
              tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`}
            />

            {/* Tooltip Customizado */}
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0F172A', 
                borderColor: 'rgba(255,255,255,0.1)',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }}
              labelStyle={{ color: '#A1A1AA' }}
              itemStyle={{ color: '#E2E8F0' }}
            />

            {/* Linhas de Área */}
            <Area 
              type="monotone" 
              dataKey="revenue" 
              stroke={chartColors.primary} 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorRevenue)" 
            />
            
            <Area 
              type="monotone" 
              dataKey="sales" 
              stroke={chartColors.secondary} 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorSales)" 
            />

            {/* Definidor de Gradiente */}
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.secondary} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={chartColors.secondary} stopOpacity={0}/>
              </linearGradient>
            </defs>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legendas de Valores */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/5">
        <div className="text-center p-4 rounded-xl bg-gradient-to-br from-primary/20 to-indigo-600/20 border border-primary/20">
          <p className="text-xs text-[#A1A1AA] uppercase tracking-wider mb-1">Receita Total</p>
          <p className="text-xl font-bold text-white">R$ 142.8K</p>
        </div>
        
        <div className="text-center p-4 rounded-xl bg-gradient-to-br from-indigo-600/20 to-blue-600/20 border border-indigo-500/20">
          <p className="text-xs text-[#A1A1AA] uppercase tracking-wider mb-1">Vendas</p>
          <p className="text-xl font-bold text-white">847</p>
        </div>

        <div className="text-center p-4 rounded-xl bg-gradient-to-br from-cyan-600/20 to-teal-600/20 border border-cyan-500/20">
          <p className="text-xs text-[#A1A1AA] uppercase tracking-wider mb-1">Visitantes</p>
          <p className="text-xl font-bold text-white">12.4K</p>
        </div>
      </div>
    </div>
  );
}
