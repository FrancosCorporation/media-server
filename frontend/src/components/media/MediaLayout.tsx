// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Film, Download, Library, Settings, Users, LogOut, Menu, X, Search, Play, type LucideIcon
} from 'lucide-react';
import { useI18n } from '@/i18n';
import LanguageSwitcher from './LanguageSwitcher';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  highlight?: boolean;
}

function useNavItems() {
  const { t } = useI18n();
  const NAV_ITEMS: NavItem[] = [
    { path: '/dolfimflix', label: t('nav.home'), icon: Film },
    { path: '/dolfimflix/assistir', label: t('nav.watch'), icon: Play },
    { path: '/dolfimflix/buscar', label: t('nav.search'), icon: Search },
    { path: '/dolfimflix/biblioteca', label: t('nav.library'), icon: Library },
    { path: '/dolfimflix/downloads', label: t('nav.downloads'), icon: Download, highlight: true },
  ];
  const ADMIN_ITEMS: NavItem[] = [
    { path: '/dolfimflix/configuracoes', label: t('nav.settings'), icon: Settings },
    { path: '/dolfimflix/usuarios', label: t('nav.users'), icon: Users },
  ];
  return { NAV_ITEMS, ADMIN_ITEMS };
}

export default function MediaLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const { NAV_ITEMS, ADMIN_ITEMS } = useNavItems();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleLogout = () => {
    localStorage.removeItem('media_token');
    window.location.href = '/dolfimflix/login';
  };

  const isActive = (path: string) => {
    if (path === '/dolfimflix') return location.pathname === '/dolfimflix';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b',
          scrolled
            ? 'bg-[#0a0a0f]/80 backdrop-blur-2xl border-white/8 shadow-lg shadow-black/20'
            : 'bg-[#0a0a0f]/40 backdrop-blur-xl border-white/5'
        )}
      >
        <div className="flex items-center justify-between px-4 md:px-8 h-14">
          <div className="flex items-center gap-6">
            <Link to="/dolfimflix" className="flex items-center gap-2.5 group">
              <div className="relative">
                <div className="absolute inset-0 bg-sky-500/30 rounded-lg blur-sm group-hover:bg-sky-400/40 transition-all duration-300" />
                <Play className="w-5 h-5 text-sky-400 relative z-10 fill-sky-400" />
              </div>
              <span className="text-lg font-bold tracking-tight">
                <span className="text-sky-400">Dolfim</span>
                <span className="text-white/90">Flix</span>
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-0.5">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 relative',
                    isActive(item.path)
                      ? 'bg-white/10 text-white shadow-inner'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  {item.label}
                  {item.highlight && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-sky-400 rounded-full shadow-sm shadow-sky-400/50" />
                  )}
                </Link>
              ))}
              <div className="w-px h-4 bg-white/10 mx-1" />
              {ADMIN_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive(item.path)
                      ? 'bg-white/10 text-white'
                      : 'text-gray-500 hover:text-white/80 hover:bg-white/5'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200"
            >
              <LogOut className="w-3.5 h-3.5" /> {t('nav.logout')}
            </button>
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={cn(
                  'md:hidden p-2 rounded-xl transition-all duration-200',
                  menuOpen
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Mobile menu panel */}
              {menuOpen && (
                <div className="absolute right-0 top-12 w-64 bg-[#14141c]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-50">
                  <div className="p-2 space-y-0.5">
                    {[...NAV_ITEMS, ...ADMIN_ITEMS].map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                          isActive(item.path)
                            ? 'bg-white/10 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        )}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        {item.label}
                        {item.highlight && (
                          <span className="ml-auto w-1.5 h-1.5 bg-sky-400 rounded-full" />
                        )}
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-white/5 mx-2" />
                  <div className="p-2">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-red-400 hover:bg-red-400/5 transition-all duration-150"
                    >
                      <LogOut className="w-4 h-4 shrink-0" /> {t('nav.logout')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="pt-14 min-h-screen">
        {children}
      </main>
    </div>
  );
}
