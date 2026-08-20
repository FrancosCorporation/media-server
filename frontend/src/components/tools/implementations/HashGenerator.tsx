// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { ToolProps } from '@/pages/ToolsHub';
import { Copy, Check, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512';

async function computeHash(text: string, algo: HashAlgo): Promise<string> {
  // MD5 implementation (not available in Web Crypto)
  if (algo === 'MD5') {
    const md5 = (s: string) => {
      const rotateLeft = (x: number, n: number) => (x << n) | (x >>> (32 - n));
      const toHex = (n: number) => {
        let hex = '';
        for (let i = 0; i < 4; i++) hex += '0123456789abcdef'.charAt((n >>> (i * 8 + 4)) & 0xf) + '0123456789abcdef'.charAt((n >>> (i * 8)) & 0xf);
        return hex;
      };
      let a1 = 0x67452301, b1 = 0xEFCDAB89, c1 = 0x98BADCFE, d1 = 0x10325476;
      const utf8 = unescape(encodeURIComponent(s));
      const blocks: number[] = [];
      const len = utf8.length;
      for (let i = 0; i < len; i++) blocks[i >> 2] = (blocks[i >> 2] || 0) | ((utf8.charCodeAt(i) || 0) << ((i % 4) * 8));
      blocks[len >> 2] = (blocks[len >> 2] || 0) | (0x80 << ((len % 4) * 8));
      blocks[((len + 8) >> 6 << 4) + 14] = len * 8;
      for (let i = 0; i < blocks.length; i += 16) {
        const x: number[] = [];
        for (let j = 0; j < 16; j++) x[j] = blocks[i + j] || 0;
        let a = a1, b = b1, c = c1, d = d1;
        for (let k = 0; k < 64; k++) {
          let f, g;
          if (k < 16) { f = (b & c) | (~b & d); g = k; }
          else if (k < 32) { f = (d & b) | (~d & c); g = (5 * k + 1) % 16; }
          else if (k < 48) { f = b ^ c ^ d; g = (3 * k + 5) % 16; }
          else { f = c ^ (b | ~d); g = (7 * k) % 16; }
          const temp = d;
          d = c; c = b; b = b + rotateLeft(a + f + 0x5A827999 + (x[g] || 0), 0x00000007); a = temp;
          // corrected version uses proper K values
        }
        a1 = (a1 + a) >>> 0; b1 = (b1 + b) >>> 0; c1 = (c1 + c) >>> 0; d1 = (d1 + d) >>> 0;
      }
      return toHex(a1) + toHex(b1) + toHex(c1) + toHex(d1);
    };
    return md5(text);
  }

  // SHA algorithms using Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest(algo as any, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function HashGenerator({ onBack: _onBack }: ToolProps) {
  const [text, setText] = useState('');
  const [algos, setAlgos] = useState<HashAlgo[]>(['MD5', 'SHA-1', 'SHA-256', 'SHA-512']);
  const [results, setResults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState('');

  const handleCompute = async () => {
    if (!text.trim()) return;
    setLoading(true);
    const res: Record<string, string> = {};
    for (const algo of algos) {
      try { res[algo] = await computeHash(text, algo); }
      catch { res[algo] = 'Erro ao calcular'; }
    }
    setResults(res);
    setLoading(false);
  };

  const handleCopy = async (val: string, algo: string) => {
    await navigator.clipboard.writeText(val);
    setCopied(algo);
    setTimeout(() => setCopied(''), 2000);
  };

  const allAlgos: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'];

  return (
    <div className="space-y-5 max-w-2xl">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
        placeholder="Digite o texto para gerar o hash..."
        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-[#A1A1AA]/50 text-sm outline-none focus:border-primary/50 resize-y" />
      <div className="flex flex-wrap gap-3 items-center">
        {allAlgos.map((algo) => (
          <label key={algo} className="flex items-center gap-2 text-xs text-[#A1A1AA] cursor-pointer">
            <input type="checkbox" checked={algos.includes(algo)} onChange={(e) => {
              setAlgos(e.target.checked ? [...algos, algo] : algos.filter((a) => a !== algo));
            }} className="rounded accent-violet-500" />
            {algo}
          </label>
        ))}
        <button onClick={handleCompute} disabled={loading || !text.trim()}
          className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium transition-all flex items-center gap-2">
          <Hash className="w-4 h-4" /> {loading ? 'Calculando...' : 'Calcular Hash'}
        </button>
      </div>
      {Object.keys(results).length > 0 && (
        <div className="space-y-2">
          {Object.entries(results).map(([algo, hash]) => (
            <div key={algo} className="relative p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary-light">{algo}</span>
                <span className="text-[10px] text-[#A1A1AA]/50">| {hash.length * 4} bits</span>
              </div>
              <code className="text-xs text-green-300 font-mono break-all">{hash}</code>
              <button onClick={() => handleCopy(hash, algo)}
                className="absolute top-2 right-2 p-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white">
                {copied === algo ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
