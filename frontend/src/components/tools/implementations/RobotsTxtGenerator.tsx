// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BotRule {
  bot: string;
  label: string;
  allowed: boolean;
}

export default function RobotsTxtGenerator({ onBack: _onBack }: ToolProps) {
  const [bots, setBots] = useState<BotRule[]>([
    { bot: 'Googlebot', label: 'Google', allowed: true },
    { bot: 'Bingbot', label: 'Bing', allowed: true },
    { bot: 'Slurp', label: 'Yahoo', allowed: true },
    { bot: 'DuckDuckBot', label: 'DuckDuckGo', allowed: true },
    { bot: 'baiduspider', label: 'Baidu', allowed: false },
  ]);
  const [disallowedPaths, setDisallowedPaths] = useState('/admin/\n/private/\n/tmp/');
  const [sitemapUrl, setSitemapUrl] = useState('https://francoscorp.com/sitemap.xml');
  const [customRules, setCustomRules] = useState('');
  const [copied, setCopied] = useState(false);

  const toggleBot = (index: number) => {
    setBots(bots.map((b, i) => i === index ? { ...b, allowed: !b.allowed } : b));
  };

  const robotsTxt = useMemo(() => {
    let result = '';
    for (const bot of bots) {
      result += `User-agent: ${bot.bot}\n`;
      result += bot.allowed ? 'Disallow:\n' : 'Disallow: /\n';
    }
    if (disallowedPaths.trim()) {
      for (const path of disallowedPaths.split('\n').filter(p => p.trim())) {
        result += `Disallow: ${path.trim()}\n`;
      }
    }
    if (customRules.trim()) result += `\n${customRules.trim()}\n`;
    if (sitemapUrl.trim()) result += `\nSitemap: ${sitemapUrl.trim()}\n`;
    return result;
  }, [bots, disallowedPaths, sitemapUrl, customRules]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(robotsTxt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">Indexadores</h3>
        <div className="space-y-2">
          {bots.map((bot, i) => (
            <div key={bot.bot} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-sm text-white">{bot.label}</span>
              <button onClick={() => toggleBot(i)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all', bot.allowed ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30')}>
                {bot.allowed ? 'Permitir' : 'Bloquear'}
              </button>
            </div>
          ))}
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Caminhos Bloqueados (um por linha)</label>
          <textarea value={disallowedPaths} onChange={(e) => setDisallowedPaths(e.target.value)} rows={3}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono outline-none focus:border-primary/50 resize-y" />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">URL do Sitemap</label>
          <input type="url" value={sitemapUrl} onChange={(e) => setSitemapUrl(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">Regras Personalizadas</label>
          <textarea value={customRules} onChange={(e) => setCustomRules(e.target.value)} rows={2} placeholder="Crawl-delay: 10"
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono outline-none focus:border-primary/50" />
        </div>
        <button onClick={handleCopy}
          className={cn('px-5 py-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-2', copied ? 'border-green-500/30 text-green-400' : 'border-white/10 text-[#A1A1AA] hover:bg-white/5')}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copiado!' : 'Copiar robots.txt'}
        </button>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white mb-4">robots.txt Gerado</h3>
        <pre className="p-4 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-green-300 font-mono overflow-auto max-h-[400px] whitespace-pre-wrap">{robotsTxt}</pre>
      </div>
    </div>
  );
}
