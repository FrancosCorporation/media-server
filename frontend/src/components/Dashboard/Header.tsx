// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, Menu, User, Settings, HelpCircle, LogOut, ChevronDown } from 'lucide-react';

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen?: boolean;
}

export default function Header({ onMenuClick, sidebarOpen = true }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const notifications = [
    { id: 1, title: 'Nova venda registrada', time: '5 min atrás' },
    { id: 2, title: 'Novo cliente cadastrado', time: '15 min atrás' },
    { id: 3, title: 'Relatório gerado com sucesso', time: '1 hora atrás' },
  ];

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className={`fixed top-0 right-0 h-16 bg-[#0F172A]/95 backdrop-blur-sm border-b border-white/5 z-30 transition-all duration-300 ${sidebarOpen ? 'left-64' : 'left-20'}`}>
      {/* Container principal */}
      <div className="flex items-center justify-between h-full px-6">
        
        {/* Esquerda: Busca e Menu Mobile */}
        <div className="flex items-center gap-4 flex-1">
          {/* Botão de Menu Mobile */}
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors duration-300 focus-visible:outline-none focus-visible:bg-white/10 lg:hidden"
            aria-label="Abrir menu lateral"
          >
            <Menu size={20} className="text-[#A1A1AA]" />
          </button>

          {/* Barra de Busca */}
          <div className="relative hidden md:block">
            <Search 
              size={16} 
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" 
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 rounded-xl bg-[#0D1117] border border-white/5 text-sm text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all duration-300 focus:w-80"
              aria-label="Barra de busca"
            />
          </div>
        </div>

        {/* Centro: Notificações */}
        <div className="flex items-center gap-2">
          {/* Badge de notificação único com dropdown */}
          <div className="relative">
            <button
              className="relative p-2 rounded-lg hover:bg-white/5 transition-colors duration-300 focus-visible:outline-none focus-visible:bg-white/10"
              aria-label="Ver notificações"
            >
              <Bell size={20} className="text-[#A1A1AA]" />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Direita: Perfil do Usuário */}
        <div className="flex items-center gap-3">
          {/* Botão de Ajuda */}
          <button
            className="p-2 rounded-lg hover:bg-white/5 transition-colors duration-300 focus-visible:outline-none focus-visible:bg-white/10"
            aria-label="Ajuda"
          >
            <HelpCircle size={20} className="text-[#A1A1AA]" />
          </button>

          {/* Menu de Perfil */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors duration-300 focus-visible:outline-none focus-visible:bg-white/10"
              aria-label="Abrir menu de perfil"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20">
                <User size={18} className="text-white" />
              </div>
              <ChevronDown size={16} className="text-[#A1A1AA]" />
            </button>

            {/* Dropdown de Perfil */}
            {userMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute top-full right-0 mt-2 w-64 bg-[#0F172A] border border-white/5 rounded-xl shadow-xl p-4 z-50">
                  {/* Informações do Usuário */}
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/5">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20">
                      <User size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">Usuário</p>
                      <p className="text-xs text-[#A1A1AA] truncate">admin@francoscorp.com</p>
                    </div>
                  </div>

                  {/* Menu de Ações */}
                  <nav className="space-y-1">
                    <button
                      onClick={() => { navigate('/dashboard/configuracoes'); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-[#A1A1AA] transition-colors duration-300 focus-visible:outline-none focus-visible:bg-white/10"
                    >
                      <Settings size={16} />
                      Configurações
                    </button>
                    <button
                      onClick={() => { navigate('/dashboard/configuracoes'); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-[#A1A1AA] transition-colors duration-300 focus-visible:outline-none focus-visible:bg-white/10"
                    >
                      <User size={16} />
                      Perfil
                    </button>
                    <hr className="border-white/5 my-2" />
                    <button
                      onClick={async () => { 
                        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
                        localStorage.removeItem('accessToken'); 
                        localStorage.removeItem('user'); 
                        navigate('/login'); 
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 text-sm text-[#A1A1AA] hover:text-red-400 transition-colors duration-300 focus-visible:outline-none focus-visible:bg-red-500/20"
                    >
                      <LogOut size={16} />
                      Sair
                    </button>
                  </nav>
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </header>
  );
}
