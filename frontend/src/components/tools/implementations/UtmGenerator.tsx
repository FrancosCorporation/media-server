// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function UtmGenerator({ onBack: _onBack }: ToolProps) {
  const [url, setUrl] = useState('https://meusite.com');
  const [source, setSource] = useState('google');
  const [medium, setMedium] = useState('cpc');
  const [campaign, setCampaign] = useState('lancamento');
  const [term, setTerm] = useState('');
  const [content, setContent] = useState('');
  const [copied, setCopied] = useState(false);

  const utmUrl = useMemo(() => {
    const base = url.split('?')[0];
    const params = new URLSearchParams();
    if (source) params.set('utm_source', source);
    if (medium) params.set('utm_medium', medium);
    if (campaign) params.set('utm_campaign', campaign);
    if (term) params.set('utm_term', term);
    if (content) params.set('utm_content', content);
    return `${base}?${params.toString()}`;
  }, [url, source, medium, campaign, term, content]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(utmUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">Parâmetros UTM</h3>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">URL de Destino *</label>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">utm_source *</label>
          <select value={source} onChange={(e) => setSource(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50">
            <option value="google">Google</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
            <option value="twitter">Twitter</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="youtube">YouTube</option>
            <option value="">Outro</option>
          </select>
          {!['google','facebook','instagram','email','linkedin','twitter','whatsapp','youtube'].includes(source) && (
            <input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Informe a source"
              className="w-full mt-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          )}
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">utm_medium *</label>
          <select value={medium} onChange={(e) => setMedium(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50">
            <option value="cpc">CPC (Pago)</option>
            <option value="organic">Orgânico</option>
            <option value="email">Email</option>
            <option value="social">Social</option>
            <option value="banner">Banner</option>
            <option value="referral">Indicação</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA] mb-1 block">utm_campaign</label>
          <input type="text" value={campaign} onChange={(e) => setCampaign(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[#A1A1AA] mb-1 block">utm_term</label>
            <input type="text" value={term} onChange={(e) => setTerm(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="text-xs text-[#A1A1AA] mb-1 block">utm_content</label>
            <input type="text" value={content} onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50" />
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">URL Gerada</h3>
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
          <code className="text-sm text-green-300 break-all font-mono">{utmUrl}</code>
        </div>
        <div className="flex gap-3">
          <button onClick={handleCopy}
            className={cn('px-5 py-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-2', copied ? 'border-green-500/30 text-green-400' : 'border-white/10 text-[#A1A1AA] hover:bg-white/5')}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar URL'}
          </button>
          <a href={utmUrl} target="_blank" rel="noopener noreferrer"
            className="px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all flex items-center gap-2">
            <ExternalLink className="w-4 h-4" /> Testar
          </a>
        </div>
      </div>
    </div>
  );
}
