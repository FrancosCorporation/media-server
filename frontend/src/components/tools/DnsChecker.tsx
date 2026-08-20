// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Globe } from 'lucide-react';

export default function DnsChecker({ onBack: _onBack }: ToolProps) {
  const [url, setUrl] = useState('');

  const info = useMemo(() => {
    if (!url.trim()) return null;
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || '80 (HTTP) / 443 (HTTPS)',
        path: parsed.pathname,
        search: parsed.search || '(nenhuma)',
        hash: parsed.hash || '(nenhum)',
      };
    } catch {
      return null;
    }
  }, [url]);

  const headers = [
    { key: 'Content-Type', value: 'text/html; charset=UTF-8', desc: 'Tipo de conteúdo retornado pelo servidor.' },
    { key: 'Status', value: '200 OK', desc: 'Requisição bem-sucedida. O servidor respondeu com os dados solicitados.' },
    { key: 'Cache-Control', value: 'public, max-age=3600', desc: 'Instruções de cache para navegadores e proxies.' },
    { key: 'X-Frame-Options', value: 'DENY / SAMEORIGIN', desc: 'Proteção contra clickjacking.' },
    { key: 'CORS (Access-Control-Allow-Origin)', value: '* / https://dominio.com', desc: 'Política de Cross-Origin — controla quais domínios podem acessar o recurso.' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000', desc: 'Força conexão HTTPS por 1 ano.' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://exemplo.com"
          className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50" />
      </div>

      {info && (
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary-light" /> URL Analyzed
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(info).map(([key, val]) => (
              <div key={key} className="p-2 rounded-lg bg-white/[0.02]">
                <span className="text-[10px] uppercase tracking-wider text-[#A1A1AA]/50">{key}</span>
                <p className="text-white font-mono text-xs mt-0.5 break-all">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Simulação de Headers HTTP</h3>
        <div className="space-y-2">
          {headers.map((h) => (
            <div key={h.key} className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-primary-light">{h.key}</span>
                <span className="text-xs font-mono text-green-400">{h.value}</span>
              </div>
              <p className="text-xs text-[#A1A1AA]/70">{h.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
