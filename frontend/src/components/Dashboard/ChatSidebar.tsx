// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';

interface Conversation {
  _id: string;
  title: string;
  model?: string;
  lastActivityAt: string;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  loading?: boolean;
  /** Chamado quando o usuário clica fora (mobile: fecha o overlay) */
  onClose?: () => void;
}

export default function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  loading,
  onClose,
}: ChatSidebarProps) {
  const handleSelect = (id: string) => {
    onSelect(id);
    onClose?.(); // fecha sidebar no mobile após selecionar
  };

  return (
    <>
      {/* Overlay escuro no mobile ao abrir sidebar */}
      <div
        className="fixed inset-0 bg-black/50 z-30 sm:hidden"
        onClick={onClose}
      />

      <div className="fixed sm:static inset-y-0 left-0 z-40 w-72 max-w-[80vw] bg-[#0F172A] sm:bg-[#0F172A]/50 border-r border-white/5 flex flex-col h-full transition-transform duration-200">
        {/* Botão fechar no mobile */}
        <div className="p-4 flex items-center justify-between sm:block">
          <button
            onClick={onNew}
            disabled={loading}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white text-sm font-medium transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            <Plus size={18} />
            Novo Chat
          </button>
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider px-3 mb-2 mt-1">
            Histórico
          </p>

          {loading ? (
            <div className="space-y-2 px-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-[#6B7280] text-center px-3 py-8">
              Nenhuma conversa ainda
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv._id}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                  activeId === conv._id
                    ? 'bg-primary/10 text-white'
                    : 'text-[#A1A1AA] hover:bg-white/5 hover:text-white'
                }`}
                onClick={() => handleSelect(conv._id)}
              >
                <MessageSquare size={16} className="flex-shrink-0" />
                <span className="flex-1 truncate text-sm">{conv.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv._id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-[#6B7280] hover:text-red-400 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
