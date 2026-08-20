// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function WhatsAppLink({ onBack: _onBack }: ToolProps) {
  const [ddd, setDdd] = useState('62');
  const [phone, setPhone] = useState('985835588');
  const [message, setMessage] = useState('Olá! Vim pelo FrancosCorp!');

  const fullPhone = `55${ddd.replace(/\D/g, '')}${phone.replace(/\D/g, '')}`;
  const encodedMessage = encodeURIComponent(message);
  const waLink = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedMessage}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(waLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-[#A1A1AA]">DDD</label>
          <input type="text" value={ddd} onChange={(e) => setDdd(e.target.value.replace(/\D/g, '').slice(0, 2))}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 mt-1" maxLength={2} />
        </div>
        <div>
          <label className="text-xs text-[#A1A1AA]">Telefone</label>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 mt-1" maxLength={9} />
        </div>
      </div>
      <div>
        <label className="text-xs text-[#A1A1AA]">Mensagem</label>
        <input type="text" value={message} onChange={(e) => setMessage(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-primary/50 mt-1" />
      </div>

      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
        <p className="text-xs text-[#A1A1AA] mb-2">Link gerado:</p>
        <code className="text-sm text-green-300 break-all font-mono">{waLink}</code>
      </div>

      <div className="flex gap-3">
        <a href={waLink} target="_blank" rel="noopener noreferrer"
          className="flex-1 px-5 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-all flex items-center justify-center gap-2">
          <ExternalLink className="w-4 h-4" /> Testar no WhatsApp
        </a>
        <button onClick={handleCopy} className={cn('px-5 py-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-2', copied ? 'border-green-500/30 text-green-400' : 'border-white/10 text-[#A1A1AA] hover:bg-white/5')}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copiado!' : 'Copiar Link'}
        </button>
      </div>
    </div>
  );
}
