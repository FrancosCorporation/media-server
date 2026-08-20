// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { LayoutGrid, ShieldCheck, Globe, BarChart3, Layers, PlayCircle } from 'lucide-react';
import { useStaggeredAnimation, useScrollAnimation } from '@/hooks/useScrollAnimation';

const features = [
  { icon: LayoutGrid, title: 'Análise Preditiva', desc: 'Preveja tendências e comportamentos com algoritmos avançados de machine learning' },
  { icon: ShieldCheck, title: 'Segurança Enterprise', desc: 'Proteção de dados com criptografia de ponta a ponta e conformidade GDPR' },
  { icon: Globe, title: 'API Global', desc: 'Acesso rápido e confiável de qualquer lugar do mundo via nossa API RESTful' },
  { icon: BarChart3, title: 'Dashboards em Tempo Real', desc: 'Visualize métricas e KPIs com gráficos interativos atualizados instantaneamente' },
  { icon: Layers, title: 'Automação Inteligente', desc: 'Automatize processos repetitivos com workflows personalizados por IA' },
  { icon: PlayCircle, title: 'Geração de Conteúdo', desc: 'Crie áudio, imagens e vídeos com nossa suite completa de ferramentas generativas' },
];

const Funcionalidades = () => {
  const { ref, visibleItems } = useStaggeredAnimation(features.length, 120);
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation({ triggerOnce: true });

  const gridPattern = 'linear-gradient(hsla(0,0%,100%,0.02) 1px, transparent 1px), linear-gradient(90deg, hsla(0,0%,100%,0.02) 1px, transparent 1px)';
  const centerRadial = 'radial-gradient(ellipse at center, hsl(var(--logo-violet) / 0.08) 0%, transparent 70%)';

  return (
    <section
      id="funcionalidades"
      ref={ref}
      className="relative py-28 md:py-36 px-6 lg:px-[8%] overflow-hidden"
      aria-labelledby="features-title"
    >
      {/* Background */}
      <div className="absolute inset-0" aria-hidden="true" style={{ background: `${centerRadial}, ${gridPattern}`, backgroundSize: '96px 96px', opacity: 0.2 }} />

      <div className="relative max-w-[1728px] mx-auto px-6 md:px-10 lg:px-16">
        {/* Header */}
        <div ref={headerRef} className={`text-center max-w-3xl mx-auto mb-16 scroll-reveal ${headerVisible ? 'is-visible' : ''}`}>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide bg-primary/10 border border-primary/25 text-primary mb-6 inline-block">
            <LayoutGrid size={14} className="text-primary" />
            Funcionalidades
          </span>
          <h2 id="features-title" className="font-display text-display-md font-semibold leading-tight">
            Tudo o que você precisa para{' '}
            <span className="text-gradient-brand">transformar seu negócio</span> com IA
          </h2>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Seis pilares fundamentais para levar sua operação ao próximo nível com inteligência artificial de ponta.
          </p>
        </div>

        {/* Grid de Cards - Responsivo sem overflow */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <article
              key={feature.title}
              className="scroll-reveal-scale group"
              style={{
                transitionDelay: `${index * 100}ms`,
                opacity: visibleItems.has(index) ? 1 : 0,
                transform: visibleItems.has(index) ? 'scale(1)' : 'scale(0.92)',
              }}
            >
              <div className="relative h-full rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-7 md:p-8 transition-all duration-500 hover:border-primary/40 hover:shadow-[0_0_60px_hsl(var(--logo-violet)/0.18)]">
                {/* Icon Wrapper */}
                <div className="relative w-14 h-14 rounded-2xl mb-6 group-hover:scale-110 transition-transform duration-500">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/15 rounded-2xl" />
                  <div className="relative flex items-center justify-center h-full">
                    <feature.icon size={26} className="text-primary" aria-hidden="true" />
                  </div>
                </div>

                {/* Title */}
                <h3 className="font-display text-lg md:text-xl font-semibold mb-3 group-hover:text-primary transition-colors duration-300">
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-muted-foreground leading-relaxed">
                  {feature.desc}
                </p>

                {/* Bottom accent line */}
                <div className="mt-6 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Funcionalidades;