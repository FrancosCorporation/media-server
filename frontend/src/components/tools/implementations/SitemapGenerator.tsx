// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SitemapGenerator({ onBack: _onBack }: ToolProps) {
  const [urls, setUrls] = useState('https://francoscorp.com/\nhttps://francoscorp.com/ferramentas\nhttps://francoscorp.com/precos');
  const [changefreq, setChangefreq] = useState('weekly');
  const [priority, setPriority] = useState('0.8');
  const [copied, setCopied] = useState(false);

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.split('\n').filter(u => u.trim()).map(url => `  <url>
    <loc>${url.trim()}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sitemap);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">URLs do Site</h3>
        <textarea value={urls} onChange={(e) => setUrls(e.target.value)} rows={8}
          placeholder="Cole uma URL por linha..."
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm font-mono outline-none focus:border-primary/50 resize-y" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[#A1A1AA] mb-1 block">Frequência</label>
            <select value={changefreq} onChange={(e) => setChangefreq(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50">
              <option value="always">Sempre</option>
              <option value="hourly">A cada hora</option>
              <option value="daily">Diariamente</option>
              <option value="weekly">Semanalmente</option>
              <option value="monthly">Mensalmente</option>
              <option value="yearly">Anualmente</option>
              <option value="never">Nunca</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#A1A1AA] mb-1 block">Prioridade</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50">
              {['1.0', '0.9', '0.8', '0.7', '0.6', '0.5', '0.4', '0.3', '0.2', '0.1'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-green-400">{urls.split('\n').filter(u => u.trim()).length} URL(s) processada(s)</p>
        <button onClick={handleCopy}
          className={cn('px-5 py-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-2', copied ? 'border-green-500/30 text-green-400' : 'border-white/10 text-[#A1A1AA] hover:bg-white/5')}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copiado!' : 'Copiar Sitemap XML'}
        </button>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white mb-4">Sitemap XML Gerado</h3>
        <pre className="p-4 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-green-300 font-mono overflow-auto max-h-[400px] whitespace-pre-wrap">{sitemap}</pre>
      </div>
    </div>
  );
}
