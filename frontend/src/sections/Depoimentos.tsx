// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Star, Quote } from 'lucide-react';
import { useStaggeredAnimation, useScrollAnimation } from '@/hooks/useScrollAnimation';

const testimonials = [
  {
    name: 'Carlos Mendes',
    role: 'CTO da TechCorp',
    avatar: 'CM',
    rating: 5,
    text: 'A plataforma transformou completamente nossa abordagem de análise de dados. O ROI foi visível em menos de um mês.',
    company: 'TechCorp'
  },
  {
    name: 'Ana Silva',
    role: 'Diretora de Inovação da DataFlow',
    avatar: 'AS',
    rating: 5,
    text: 'As ferramentas generativas nos ajudaram a reduzir o tempo de desenvolvimento em 60%. Recomendo para qualquer empresa.',
    company: 'DataFlow'
  },
  {
    name: 'Roberto Santos',
    role: 'CEO da Innovate Labs',
    avatar: 'RS',
    rating: 5,
    text: 'A qualidade das IAs generativas é impressionante. Estamos criando produtos que antes eram impossíveis de desenvolver.',
    company: 'Innovate Labs'
  }
];

const Depoimentos = () => {
  const { ref, visibleItems } = useStaggeredAnimation(testimonials.length, 120);
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation({ triggerOnce: true });

  return (
    <section
      id="depoimentos"
      ref={ref}
      className="relative py-28 md:py-36 px-6 lg:px-[8%] overflow-hidden"
      aria-labelledby="testimonials-title"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(var(--logo-violet),0.08)_0%,_transparent_70%)] bg-[linear-gradient(hsla(0,0%,100%,0.02)_1px,transparent_1px),linear-gradient(90deg,hsla(0,0%,100%,0.02)_1px,transparent_1px)] opacity-20" aria-hidden="true" style={{ backgroundSize: '96px 96px' }} />
      <div className="absolute top-20 right-10 w-72 h-72 rounded-full bg-[hsl(var(--logo-cyan))/0.05] blur-3xl pointer-events-none" />

      <div className="relative max-w-[1728px] mx-auto px-6 md:px-10 lg:px-16">
        {/* Header */}
        <div ref={headerRef} className={`text-center max-w-3xl mx-auto mb-16 scroll-reveal ${headerVisible ? 'is-visible' : ''}`}>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide bg-[hsl(var(--logo-violet))/0.12] border border-[hsl(var(--logo-violet))/0.25] text-logo-violet-light mb-6 inline-block">
            <Quote size={14} className="text-logo-violet-light" />
            Depoimentos
          </span>
          <h2 id="testimonials-title" className="font-display text-display-md font-semibold leading-tight">
            O que nossos{' '}
            <span className="text-gradient-brand">clientes dizem</span> sobre a plataforma
          </h2>
        </div>

        {/* Testimonials Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <article
              key={`${testimonial.name}-${index}`}
              className="scroll-reveal-scale"
              style={{
                transitionDelay: `${index * 100}ms`,
                opacity: visibleItems.has(index) ? 1 : 0,
                transform: visibleItems.has(index) ? 'scale(1)' : 'scale(0.92)',
              }}
            >
              <div className="rounded-2xl border border-card-border bg-[hsl(var(--card))/0.6] backdrop-blur-sm p-7 md:p-8 h-full flex flex-col relative group">
                {/* Quote icon */}
                <div className="absolute top-6 right-6 text-[hsl(var(--logo-violet))/0.15]">
                  <Quote size={56} />
                </div>

                {/* Stars */}
                <div className="flex gap-1 mb-5 relative z-10">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} size={18} className="text-yellow-400 fill-yellow-400" aria-hidden="true" />
                  ))}
                </div>

                {/* Text */}
                <blockquote className="flex-1 relative z-10">
                  <p className="text-foreground text-base leading-relaxed">
                    &ldquo;{testimonial.text}&rdquo;
                  </p>
                </blockquote>

                {/* Author */}
                <div className="flex items-center gap-4 pt-4 border-t border-card-border relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[hsl(var(--logo-violet))] to-[hsl(280,85%,55%)] flex items-center justify-center text-white font-semibold text-sm">
                    {testimonial.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Depoimentos;