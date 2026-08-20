// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  ShoppingCart, 
  FileText, 
  Settings, 
  BarChart3, 
  ChevronLeft,
  ChevronRight,
  LogOut,
  Home
} from 'lucide-react';

interface NavItem {
  name: string;
  icon: React.ElementType;
  path: string;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: 'Clientes', icon: Users, path: '/clientes' },
  { name: 'Vendas', icon: ShoppingCart, path: '/vendas' },
  { name: 'Relatórios', icon: FileText, path: '/relatorios' },
  { name: 'Analytics', icon: BarChart3, path: '/analytics' },
];

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

export default function Sidebar({ isOpen, toggleSidebar }: SidebarProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-[#0F172A] border-r border-white/5 transition-all duration-300 z-40 ${
        isOpen ? 'w-64' : 'w-20'
      }`}
    >
      {/* Header do Sidebar */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-white/5">
        <div className={`flex items-center gap-3 ${!isOpen ? 'hidden' : ''}`}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-white font-bold text-sm">FC</span>
          </div>
          <span className="font-display text-xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            Francos Corp
          </span>
        </div>
        
        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors duration-300 focus-visible:outline-none focus-visible:bg-white/10"
          aria-label={isOpen ? 'Fechar sidebar' : 'Abrir sidebar'}
        >
          {isOpen ? (
            <ChevronLeft size={20} className="text-white" />
          ) : (
            <ChevronRight size={20} className="text-white" />
          )}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="p-3 space-y-1">
        {navItems.map((item) => (
          <a
            key={item.path}
            href={item.path}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
              item.path === '/dashboard'
                ? 'bg-gradient-to-r from-primary/20 to-indigo-600/20 text-white shadow-lg shadow-primary/10'
                : 'text-[#A1A1AA] hover:text-white hover:bg-white/5'
            }`}
          >
            <item.icon size={20} className={`${
              item.path === '/dashboard' 
                ? 'text-primary-light' 
                : 'text-[#6B7280] group-hover:text-white'
            }`} />
            {isOpen && (
              <span className="font-medium">{item.name}</span>
            )}
          </a>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1">
        {/* Inicio - volta para o site mantendo sessao */}
        <button
          onClick={() => navigate('/')}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group w-full text-left ${
            'text-[#A1A1AA] hover:text-white hover:bg-white/5'
          }`}
        >
          <Home size={20} className="text-[#6B7280] group-hover:text-white" />
          {isOpen && (
            <span className="font-medium">Início</span>
          )}
        </button>

        <a
          href="/dashboard/configuracoes"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
            'text-[#A1A1AA] hover:text-white hover:bg-white/5'
          }`}
        >
          <Settings size={20} className="text-[#6B7280] group-hover:text-white" />
          {isOpen && (
            <span className="font-medium">Configurações</span>
          )}
        </a>

        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group w-full text-left ${
            'text-[#A1A1AA] hover:text-red-400 hover:bg-red-500/10'
          }`}
        >
          <LogOut size={20} className="text-[#6B7280] group-hover:text-red-400" />
          {isOpen && (
            <span className="font-medium">Sair</span>
          )}
        </button>
      </div>
    </aside>
  );
}
