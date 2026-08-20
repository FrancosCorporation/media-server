// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { User, Bot, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
}

export default function ChatMessage({ role, content, model }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-6 ${role === 'assistant' ? 'bg-[#0D1117]/30' : ''}`}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        {role === 'assistant' ? (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20">
            <Bot size={18} className="text-white" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-[#1E293B] flex items-center justify-center">
            <User size={18} className="text-[#A1A1AA]" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-white">
            {role === 'assistant' ? (model || 'IA') : 'Você'}
          </span>
          {model && role === 'assistant' && (
            <span className="text-xs text-[#6B7280] bg-white/5 px-2 py-0.5 rounded-full">
              {model}
            </span>
          )}
        </div>

        {/* Message text — word-break previne overflow horizontal */}
        <div className="text-[#E2E8F0] leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere">
          {content}
        </div>

        {/* Actions */}
        {role === 'assistant' && (
          <button
            onClick={handleCopy}
            className="mt-3 flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#A1A1AA] transition-colors"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-400" />
                <span className="text-emerald-400">Copiado!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copiar</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
