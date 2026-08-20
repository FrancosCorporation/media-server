// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Github, Twitter, Linkedin, Mail, MessageSquare } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const LOGO_URL = '/logo.jpg';

const navigationLinks = [
  { label: 'Início', href: '#hero' },
  { label: 'Funcionalidades', href: '#funcionalidades' },
  { label: 'Preços', href: '#precos' },
  { label: 'Como Funciona', href: '#como-funciona' },
  { label: 'Depoimentos', href: '#depoimentos' },
  { label: 'FAQ', href: '#faq' },
];

const socialLinks = [
  { icon: Github, href: 'https://github.com/francoscorporation', label: 'GitHub' },
  { icon: Twitter, href: 'https://x.com/francoscorporat', label: 'X (Twitter)' },
  { icon: Linkedin, href: 'https://www.linkedin.com/in/francoscorp/', label: 'LinkedIn' },
];

const Footer = () => {
  const year = new Date().getFullYear();
  const { ref, isVisible } = useScrollAnimation({ triggerOnce: true });

  return (
    <footer
      ref={ref}
      className="relative py-20 px-6 lg:px-[8%] bg-background overflow-hidden border-t border-card-border"
      role="contentinfo"
    >
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-[hsl(var(--logo-violet))/0.08] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full bg-[hsl(var(--logo-cyan))/0.05] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(hsla(0,0%,100%,0.01)_1px,transparent_1px),linear-gradient(90deg,hsla(0,0%,100%,0.01)_1px,transparent_1px)]" style={{ backgroundSize: '80px 80px' }} />
      </div>

      <div className="relative max-w-[1728px] mx-auto px-6 md:px-10 lg:px-16">
        <div className={`grid gap-10 md:grid-cols-3 mb-16 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`} style={{ transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          {/* Brand */}
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-3xl overflow-hidden border border-card-border bg-card shadow-lg shadow-[hsl(var(--logo-violet))/0.1] flex-shrink-0">
                <img src={LOGO_URL} alt="Francos Corp" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">Francos Corp</p>
                <p className="text-sm text-muted-foreground">IA estratégica para empresas que desejam automação de ponta.</p>
              </div>
            </div>
            <p className="text-muted-foreground max-w-xs leading-relaxed">
              Plataforma de inteligência artificial que integra análise, mídia on demand e automações robustas com visual moderno e controle completo sobre seus dados.
            </p>
          </div>

          {/* Navigation */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Navegação rápida</h3>
            <nav aria-label="Navegação do rodapé">
              <ul className="grid gap-2 text-muted-foreground">
                {navigationLinks.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="block hover:text-foreground transition-colors duration-300"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Contato & Social</h3>
            <div className="space-y-3">
              <a href="mailto:francoscorpration@gmail.com" className="flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors duration-300 group">
                <Mail size={18} className="text-logo-violet-light group-hover:scale-110 transition-transform" />
                <span>francoscorpration@gmail.com</span>
              </a>
              <a href="https://wa.me/5562985835588" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors duration-300 group">
                <MessageSquare size={18} className="text-green-500 group-hover:scale-110 transition-transform" />
                <span>WhatsApp</span>
              </a>
            </div>
            <div className="flex items-center gap-4 pt-2">
              {socialLinks.map((social, index) => (
                <a
                  key={index}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-card-border bg-[hsl(var(--card))/0.6] backdrop-blur-sm p-2 text-muted-foreground hover:text-foreground hover:border-[hsl(var(--logo-violet))/0.3] transition-all duration-300"
                  aria-label={social.label}
                >
                  <social.icon size={20} />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className={`border-t border-card-border pt-8 text-center text-sm text-muted-foreground ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`} style={{ transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)', transitionDelay: '300ms' }}>
          <p>© {year} Francos Corporation. Todos os direitos reservados.</p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6 mt-4">
            {['Termos de Uso', 'Privacidade', 'Cookies'].map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, '-')}`} className="hover:text-foreground transition-colors duration-300">
                {item}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;