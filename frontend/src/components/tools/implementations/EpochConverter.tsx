// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useEffect } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EpochConverter({ onBack: _onBack }: ToolProps) {
  const [timestamp, setTimestamp] = useState(Math.floor(Date.now() / 1000).toString());
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 16));
  const [convertedDate, setConvertedDate] = useState('');
  const [convertedTimestamp, setConvertedTimestamp] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const ts = parseInt(timestamp);
    if (!isNaN(ts)) {
      const d = new Date(ts * 1000);
      setConvertedDate(d.toLocaleString('pt-BR', { timeZone: 'UTC' }) + ' UTC | ' + d.toLocaleString('pt-BR'));
    } else {
      setConvertedDate('Timestamp inválido');
    }
  }, [timestamp]);

  const handleDateToEpoch = () => {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const epoch = Math.floor(d.getTime() / 1000);
      setConvertedTimestamp(epoch.toString());
      setTimestamp(epoch.toString());
    } else {
      setConvertedTimestamp('Data inválida');
    }
  };

  const handleNow = () => {
    const now = Math.floor(Date.now() / 1000);
    setTimestamp(now.toString());
    setDateStr(new Date().toISOString().slice(0, 16));
  };

  const handleCopy = async (val: string, type: string) => {
    await navigator.clipboard.writeText(val);
    setCopied(type);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Timestamp → Data */}
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Unix Timestamp → Data</h3>
        <div className="flex gap-2">
          <input type="text" value={timestamp} onChange={(e) => setTimestamp(e.target.value.replace(/\D/g, ''))}
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono outline-none focus:border-primary/50" />
          <button onClick={handleNow} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[#A1A1AA] hover:text-white text-sm">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <div className="p-3 rounded-xl bg-primary/10 text-sm text-primary-light/80 font-mono">{convertedDate || 'Aguardando...'}</div>
          {convertedDate && !convertedDate.includes('inválido') && (
            <button onClick={() => handleCopy(convertedDate, 'date')}
              className="absolute top-2 right-2 p-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white">
              {copied === 'date' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Data → Timestamp */}
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Data → Unix Timestamp</h3>
        <input type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        <button onClick={handleDateToEpoch}
          className="w-full px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all">
          Converter
        </button>
        {convertedTimestamp && (
          <div className="relative">
            <div className="p-3 rounded-xl bg-green-500/10 text-sm text-green-300 font-mono">{convertedTimestamp}</div>
            {!convertedTimestamp.includes('inválida') && (
              <button onClick={() => handleCopy(convertedTimestamp, 'ts')}
                className="absolute top-2 right-2 p-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white">
                {copied === 'ts' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
