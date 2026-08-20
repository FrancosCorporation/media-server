// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LayoutGrid, ShieldCheck, Globe } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const benefits = [
  { icon: LayoutGrid, text: 'Setup em 2 minutos' },
  { icon: ShieldCheck, text: 'Segurança enterprise' },
  { icon: Globe, text: 'API global e rápida' },
];

const CTAFinal = () => {
  const navigate = useNavigate();
  const { ref, isVisible } = useScrollAnimation({ triggerOnce: true });

  return (
    <section
      id="cta-final"
      ref={ref}
      className="relative py-28 md:py-36 px-6 lg:px-[8%] overflow-hidden"
      aria-labelledby="cta-title"
    >
      {/* Background - Stronger for CTA */}
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--logo-violet))/0.08] via-transparent to-[hsl(var(--logo-cyan))/0.05]" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(var(--logo-violet),0.08)_0%,_transparent_70%)] opacity-50" />
      <div className="absolute inset-0 bg-[linear-gradient(hsla(0,0%,100%,0.02)_1px,transparent_1px),linear-gradient(90deg,hsla(0,0%,100%,0.02)_1px,transparent_1px)] opacity-20" style={{ backgroundSize: '96px 96px' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[70vw] max-w-[700px] max-h-[700px] rounded-full bg-[radial-gradient(ellipse_at_center,_hsl(var(--logo-violet),0.1)_0%,_transparent_70%)] pointer-events-none" />

      <div className="relative max-w-[1728px] mx-auto px-6 md:px-10 lg:px-16">
        <div className="text-center max-w-3xl mx-auto">
          {/* Badge */}
          <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide bg-[hsl(var(--logo-violet))/0.12] border border-[hsl(var(--logo-violet))/0.25] text-logo-violet-light mb-6 inline-block scroll-reveal ${isVisible ? 'is-visible' : ''}`} style={{ transitionDelay: '0ms' }}>
            <LayoutGrid size={14} className="text-logo-violet-light" />
            Pronto para transformar seu negócio?
          </span>

          {/* Title */}
          <h2 id="cta-title" className={`font-display text-display-md font-semibold leading-tight scroll-reveal ${isVisible ? 'is-visible' : ''}`} style={{ transitionDelay: '150ms' }}>
            Comece sua jornada com{' '}
            <span className="text-gradient-brand">Inteligência Artificial</span> hoje mesmo
          </h2>

          {/* Subtitle */}
          <p className={`mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed scroll-reveal ${isVisible ? 'is-visible' : ''}`} style={{ transitionDelay: '300ms' }}>
            Junte-se a centenas de empresas que já estão usando nossa plataforma para inovar, automatizar e crescer.
            Sem cartão de crédito necessário nos primeiros 14 dias.
          </p>

          {/* Benefits */}
          <div className={`mt-10 flex flex-wrap justify-center gap-3 scroll-reveal ${isVisible ? 'is-visible' : ''}`} style={{ transitionDelay: '450ms' }}>
            {benefits.map((benefit, index) => (
              <div key={index} className="rounded-2xl border border-card-border bg-[hsl(var(--card))/0.6] backdrop-blur-sm px-4 py-2 flex items-center gap-2 text-sm">
                <benefit.icon size={16} className="text-logo-violet-light" />
                <span className="text-foreground">{benefit.text}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className={`mt-12 flex flex-col sm:flex-row justify-center gap-4 scroll-reveal ${isVisible ? 'is-visible' : ''}`} style={{ transitionDelay: '600ms' }}>
            <button
              onClick={() => navigate('/register')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-300 bg-gradient-to-r from-[hsl(var(--logo-violet))] to-[hsl(var(--logo-cyan))] text-white px-10 py-4 text-base group shadow-[0_4px_24px_hsla(var(--logo-violet),0.35)] hover:shadow-[0_8px_32px_hsla(var(--logo-violet),0.5)] hover:-translate-y-0.5 active:scale-[0.98]"
            >
              Criar conta gratuita
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>

            <button
              onClick={() => navigate('/login')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-300 bg-[hsl(var(--card))/0.8] border border-card-border text-foreground px-10 py-4 text-base backdrop-blur-sm hover:bg-[hsl(var(--muted))/0.9] hover:border-[hsl(var(--logo-violet))/0.3]"
            >
              Fazer login
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTAFinal;