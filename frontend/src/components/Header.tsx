// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Github as GithubIcon, Twitter as TwitterIcon, Linkedin as LinkedinIcon, Mail as MailIcon, Phone as PhoneIcon, Instagram as InstagramIcon, LayoutGrid, Menu, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
const LOGO_URL = '/logo.jpg';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authState, setAuthState] = useState<{ authenticated: boolean; admin: boolean }>({ authenticated: false, admin: false });

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Skip auth check on DolfimFlix routes - they use media_token
    if (location.pathname.startsWith('/dolfimflix')) {
      setAuthState({ authenticated: false, admin: false });
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      setAuthState({ authenticated: false, admin: false });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/auth/me', { skipAuthRedirect: true });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setAuthState({ authenticated: true, admin: data.role === 'admin' });
        }
      } catch {
        if (!cancelled) setAuthState({ authenticated: false, admin: false });
      }
    })();
    return () => { cancelled = true; };
  }, [location.pathname]);

  const scrollToSection = useCallback((sectionId: string) => {
    if (location.pathname === '/') {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      navigate(`/#${sectionId}`);
    }
    setMobileMenuOpen(false);
  }, [location.pathname, navigate]);

  const navLinks = [
    { section: 'hero', label: 'Início' },
    { section: 'funcionalidades', label: 'Funcionalidades' },
    { section: 'precos', label: 'Preços' },
    { section: 'como-funciona', label: 'Como Funciona' },
    { section: 'depoimentos', label: 'Depoimentos' },
    { section: 'faq', label: 'FAQ' }
  ];

  const socialLinks = [
    { icon: GithubIcon, href: 'https://github.com/francoscorporation', external: false },
    { icon: TwitterIcon, href: 'https://x.com/francoscorporat', external: true },
    { icon: LinkedinIcon, href: 'https://www.linkedin.com/in/francoscorp/', external: true },
    { icon: InstagramIcon, href: 'https://instagram.com/francoscorporation', external: true }
  ];

  const whatsappComponent = <PhoneIcon size={16} />;
  const emailComponent = <MailIcon size={16} />;

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-[#080a12]/95 backdrop-blur-xl shadow-2xl shadow-black/20 border-b border-white/10' : 'bg-transparent'}`}
      style={{ left: 'env(safe-area-inset-left, 0px)', right: 'env(safe-area-inset-right, 0px)' }}>
      <div className="px-6 lg:px-[8%]">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between h-16 md:h-20 gap-4">
          <a href="/" className="flex items-center gap-3 transition-transform duration-300 hover:-translate-y-0.5">
            <div className="relative w-12 h-12 rounded-3xl overflow-hidden border border-white/10 shadow-lg shadow-violet-500/10 bg-white/5">
              <img src={LOGO_URL} alt="Francos Corp" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
            </div>
            <div className="leading-tight">
              <p className="text-base font-semibold text-white">Francos Corp</p>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">IA & Automação</p>
            </div>
          </a>

          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.section}
                onClick={() => scrollToSection(link.section)}
                className={`hidden xl:inline-flex px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${isScrolled ? 'text-slate-300 hover:text-white hover:bg-white/5' : 'text-white/75 hover:text-white hover:bg-white/10'}`}
              >
                {link.label}
              </button>
            ))}

            <Link
              to="/tools"
              className={`relative px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center transition-all duration-300 ${isScrolled ? 'text-violet-200 hover:text-white hover:bg-white/5' : 'text-violet-200/90 hover:text-white hover:bg-white/10'}`}
            >
              <LayoutGrid size={14} className="mr-1.5" />
              Ferramentas
              <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-[10px] font-semibold">NOVO</span>
            </Link>

            <Link
              to="/dolfimflix"
              className={`relative px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center transition-all duration-300 ${isScrolled ? 'text-sky-300 hover:text-white hover:bg-white/5' : 'text-sky-300/90 hover:text-white hover:bg-white/10'}`}
            >
              <LayoutGrid size={14} className="mr-1.5" />
              DolfimFlix
              <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/30 text-sky-200 text-[10px] font-semibold">NOVO</span>
            </Link>
          </div>

          <div className="hidden xl:flex items-center gap-3 border-l border-white/10 pl-4">
            <a href="https://wa.me/5562985835588" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white transition-colors duration-300">
              {whatsappComponent}
            </a>
            <a href="mailto:francoscorpration@gmail.com" className="text-white/70 hover:text-white transition-colors duration-300">
              {emailComponent}
            </a>
          </div>

          <div className="hidden lg:flex items-center gap-3 border-l border-white/10 pl-4">
            {!authState.authenticated ? (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-colors duration-300"
                >
                  Login
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 text-black text-sm font-semibold shadow-lg shadow-cyan-400/10 transition-all duration-300"
                >
                  Criar conta
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 text-black text-sm font-semibold shadow-lg shadow-emerald-500/10 transition-all duration-300"
                >
                  Dashboard
                </button>
                {authState.admin && (
                  <button
                    onClick={() => navigate('/adminlea')}
                    className="px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-black text-sm font-semibold shadow-lg shadow-amber-500/10 transition-all duration-300"
                  >
                    Admin
                  </button>
                )}
                <button
                  onClick={() => {
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('user');
                    navigate('/login', { replace: true });
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-colors duration-300"
                >
                  Sair
                </button>
              </>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl text-white/90 bg-white/5 hover:bg-white/10 transition-colors duration-300"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden absolute top-20 left-0 right-0 bg-[#080a12]/95 backdrop-blur-xl border-t border-white/10 p-4 flex flex-col gap-2 shadow-2xl shadow-black/20">
          {navLinks.map((link) => (
            <button
              key={link.section}
              onClick={() => scrollToSection(link.section)}
              className="w-full text-left px-4 py-3 rounded-2xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors duration-300"
            >
              {link.label}
            </button>
          ))}
          <Link
            to="/tools"
            onClick={() => setMobileMenuOpen(false)}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors duration-300"
          >
            <LayoutGrid size={16} />
            Ferramentas
          </Link>
          <Link
            to="/dolfimflix"
            onClick={() => setMobileMenuOpen(false)}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-sky-300 hover:text-white hover:bg-white/10 transition-colors duration-300"
          >
            <LayoutGrid size={16} />
            DolfimFlix
          </Link>
          <button
            onClick={() => navigate('/fila-espera')}
            className="w-full mt-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 text-black font-semibold transition-all duration-300 shadow-lg"
          >
            Entrar na Fila de Espera
          </button>

          <div className="flex justify-center gap-x-4 mt-4 px-4 py-3 border-t border-white/10">
            {socialLinks.map((link, index) => (
              <a
                key={index}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener noreferrer' : undefined}
                className="hover:text-[#A78BFA] text-white transition-colors duration-300"
              >
                <link.icon size={20} />
              </a>
            ))}
            <a href="https://wa.me/5562985835588" target="_blank" rel="noopener noreferrer" className="hover:text-[#A78BFA] text-white transition-colors duration-300">
              {whatsappComponent}
            </a>
            <a href="mailto:francoscorpration@gmail.com" className="hover:text-[#A78BFA] text-white transition-colors duration-300">
              {emailComponent}
            </a>
          </div>

          <div className="grid gap-3 mt-4 px-4 py-3 border-t border-white/10">
            {!authState.authenticated ? (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="w-full px-4 py-3 rounded-2xl bg-[#0F172A] text-white/80 hover:text-white border border-white/10 transition-all duration-300"
                >
                  Login
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 text-black font-semibold transition-all duration-300 shadow-lg"
                >
                  Criar conta
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 text-black font-semibold transition-all duration-300 shadow-lg"
                >
                  Dashboard
                </button>
                {authState.admin && (
                  <button
                    onClick={() => navigate('/adminlea')}
                    className="w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-semibold transition-all duration-300 shadow-lg"
                  >
                    Admin
                  </button>
                )}
                <button
                  onClick={() => {
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('user');
                    navigate('/login', { replace: true });
                  }}
                  className="w-full px-4 py-3 rounded-2xl bg-[#0F172A] text-white/80 hover:text-white border border-white/10 transition-all duration-300"
                >
                  Sair
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
