// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LayoutGrid, CheckCircle2, Zap } from 'lucide-react';
import { useStaggeredAnimation, useScrollAnimation } from '@/hooks/useScrollAnimation';

const steps = [
  { 
    icon: LayoutGrid, 
    number: '01',
    title: 'Cadastro Rápido', 
    desc: 'Crie sua conta em menos de 2 minutos sem necessidade de cartão de crédito' 
  },
  { 
    icon: CheckCircle2, 
    number: '02',
    title: 'Acesso às Ferramentas', 
    desc: 'Experimente nossas IAs generativas e ferramentas de automação imediatamente' 
  },
  { 
    icon: Zap, 
    number: '03',
    title: 'Comece a Criar', 
    desc: 'Gere áudio, imagens e automatize processos com nossa plataforma unificada' 
  }
];

const Narrativa = () => {
  const navigate = useNavigate();
  const { ref, visibleItems } = useStaggeredAnimation(steps.length, 150);
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation({ triggerOnce: true });
  const { ref: ctaRef, isVisible: ctaVisible } = useScrollAnimation({ triggerOnce: true });

  return (
    <section
      id="como-funciona"
      ref={ref}
      className="relative py-28 md:py-36 px-6 lg:px-[8%] overflow-hidden"
      aria-labelledby="narrativa-title"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(var(--logo-violet),0.06)_0%,_transparent_70%)] bg-[linear-gradient(hsla(0,0%,100%,0.02)_1px,transparent_1px),linear-gradient(90deg,hsla(0,0%,100%,0.02)_1px,transparent_1px)] opacity-20" aria-hidden="true" style={{ backgroundSize: '96px 96px' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] rounded-full bg-[radial-gradient(ellipse_at_center,_hsl(var(--logo-violet),0.06)_0%,_transparent_70%)] pointer-events-none" />

      <div className="relative max-w-[1728px] mx-auto px-6 md:px-10 lg:px-16">
        {/* Header */}
        <div ref={headerRef} className={`text-center max-w-3xl mx-auto mb-16 scroll-reveal ${headerVisible ? 'is-visible' : ''}`}>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide bg-[hsl(var(--logo-violet))/0.12] border border-[hsl(var(--logo-violet))/0.25] text-logo-violet-light mb-6 inline-block">
            <LayoutGrid size={14} className="text-logo-violet-light" />
            Como Funciona
          </span>
          <h2 id="narrativa-title" className="font-display text-display-md font-semibold leading-tight">
            Comece sua jornada com{' '}
            <span className="text-gradient-brand">Inteligência Artificial</span> em 3 passos simples
          </h2>
        </div>

        {/* Steps - Horizontal layout with connectors */}
        <div className="relative">
          {/* Connector line */}
          <div className="hidden lg:block absolute top-14 left-1/2 w-px h-full bg-gradient-to-b from-transparent via-[hsl(var(--logo-violet))/0.3] to-transparent -translate-x-1/2 pointer-events-none" />
          
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, index) => (
              <article
                key={step.title}
                className="relative scroll-reveal-scale"
                style={{
                  transitionDelay: `${index * 150}ms`,
                  opacity: visibleItems.has(index) ? 1 : 0,
                  transform: visibleItems.has(index) ? 'scale(1)' : 'scale(0.92)',
                }}
              >
                {/* Step Number */}
                <div className="absolute -left-4 lg:left-auto lg:top-0 lg:-translate-x-1/2 text-[10px] font-bold text-[hsl(var(--logo-violet))/0.5] uppercase tracking-wider">
                  {step.number}
                </div>

                <div className="rounded-2xl border border-card-border bg-[hsl(var(--card))/0.6] backdrop-blur-sm p-7 md:p-8 h-full relative group">
                  {/* Icon */}
                  <div className="relative w-16 h-16 rounded-2xl mb-6">
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,_hsl(var(--logo-violet)/0.15)_0%,_hsl(var(--logo-cyan)/0.1)_100%)] rounded-2xl" />
                    <div className="relative flex items-center justify-center h-full">
                      <step.icon size={32} className="text-logo-violet-light" />
                    </div>
                    {/* Pulse ring on hover */}
                    <div className="absolute inset-0 rounded-2xl border border-[hsl(var(--logo-violet))/0.3] opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-pulse-glow" />
                  </div>

                  <h3 className="font-display text-xl font-semibold mb-3">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed mb-6">{step.desc}</p>

                  {/* Arrow indicator */}
                  <div className="flex items-center gap-2 text-sm font-medium text-logo-violet-light opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span>Continuar</span>
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div ref={ctaRef} className={`mt-16 flex flex-col sm:flex-row justify-center gap-4 scroll-reveal ${ctaVisible ? 'is-visible' : ''}`} style={{ transitionDelay: '400ms' }}>
          <a
            href="/register"
            className="inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-300 bg-gradient-to-r from-[hsl(var(--logo-violet))] to-[hsl(var(--logo-cyan))] text-white px-10 py-4 text-base group shadow-[0_4px_24px_hsla(var(--logo-violet),0.35)] hover:shadow-[0_8px_32px_hsla(var(--logo-violet),0.5)] hover:-translate-y-0.5 active:scale-[0.98]"
          >
            Criar conta gratuita
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </a>
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-300 bg-[hsl(var(--card))/0.8] border border-card-border text-foreground px-10 py-4 text-base backdrop-blur-sm hover:bg-[hsl(var(--muted))/0.9] hover:border-[hsl(var(--logo-violet))/0.3]"
          >
            Fazer login
          </button>
        </div>
      </div>
    </section>
  );
};

export default Narrativa;