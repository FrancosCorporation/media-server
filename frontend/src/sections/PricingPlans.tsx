// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid, Sparkles, Shield, MessageCircle, Image, LayoutDashboard, Music,
  Code2, Cpu, Gauge, Headphones, Building2, FlaskConical, ArrowRight, Users, Atom, Lock, GitBranch,
} from 'lucide-react';
import { useStaggeredAnimation, useScrollAnimation } from '@/hooks/useScrollAnimation';

// ═══════════════════════════════════════════════════════════════
// PRICING CONFIG — Single source of truth
// ═══════════════════════════════════════════════════════════════
const PRICING_CONFIG = {
  light: {
    name: 'Light',
    subtitle: 'Para quem está começando',
    price: 'R$ 49,90',
    period: '/mês',
    description: 'Acesso essencial ao ecossistema Francos IA. Ideal para testes e tarefas leves do dia a dia.',
    icon: LayoutGrid,
    color: 'slate',
    features: [
      { icon: MessageCircle, text: 'Chat Exclusivo — Interface limpa e otimizada para interações diárias.' },
      { icon: Image, text: 'Geração de Imagens — Criação de imagens via prompt com resultados de alta qualidade.' },
      { icon: LayoutDashboard, text: 'Dashboard Exclusivo — Painel personalizado com métricas de uso.' },
      { icon: Music, text: 'Geração de Áudio e Música — Músicas e trilhas royalty-free para uso comercial.' },
      { icon: Cpu, text: 'Modelos otimizados — IAs preparadas para tarefas cotidianas e respostas rápidas.' },
      { icon: Gauge, text: 'Fila de processamento padrão — Tempo de resposta equilibrado.' },
      { icon: Headphones, text: 'Suporte via e-mail em horário comercial.' },
    ],
    highlighted: false,
    tag: null,
    cta: 'Assinar Light',
    ctaAction: 'register' as const,
  },
  pro: {
    name: 'Pro',
    subtitle: 'Para profissionais e uso intensivo',
    price: 'R$ 149,90',
    period: '/mês',
    description: 'O melhor custo-benefício do mercado. Performance profissional com prioridade total e recursos avançados de IA.',
    icon: Sparkles,
    color: 'violet',
    features: [
      { icon: MessageCircle, text: 'Chat Exclusivo Prioritário — Respostas aceleradas com prioridade na fila.' },
      { icon: Image, text: 'Geração de Imagens Avançada — Alta resolução e estilos variados via prompt.' },
      { icon: LayoutDashboard, text: 'Dashboard Premium — Métricas avançadas, histórico completo e insights de uso.' },
      { icon: Music, text: 'Geração de Áudio e Música Ilimitada — Trilhas completas, royalty-free, uso comercial irrestrito.' },
      { icon: Lock, text: 'API Dedicada — Requisições diretas às IAs com privacidade total. Seus dados nunca são salvos nem usados para treinamento.' },
      { icon: Code2, text: 'Modelos Avançados — Acesso a IAs de bilhões de parâmetros especializadas em código e raciocínio complexo.' },
      { icon: Gauge, text: 'Fila prioritária — Processamento acelerado, sem esperas longas.' },
      { icon: Headphones, text: 'Suporte prioritário 24/7 — Atendimento ágil sempre que precisar.' },
    ],
    highlighted: true,
    tag: 'MELHOR CUSTO-BENEFÍCIO',
    cta: 'Assinar Pro',
    ctaAction: 'register' as const,
  },
  enterprise: {
    name: 'Enterprise',
    subtitle: 'Para empresas e alta demanda',
    price: 'R$ 999,99',
    period: '/mês',
    description: 'Infraestrutura corporativa dedicada. Customização completa, fine-tuning de modelos e capacidade de processamento sob demanda.',
    icon: Shield,
    color: 'indigo',
    features: [
      { icon: MessageCircle, text: 'Chat Corporativo — Prioridade máxima absoluta. Processamento instantâneo, zero espera.' },
      { icon: Image, text: 'Geração de Imagens Enterprise — Resolução máxima, geração em lote e integração por API.' },
      { icon: LayoutDashboard, text: 'Dashboard Corporativo — Painel executivo com relatórios exportáveis e auditoria.' },
      { icon: Music, text: 'Áudio e Música Ilimitado — Geração em lote, royalties liberados para distribuição comercial.' },
      { icon: Lock, text: 'API Dedicada com Sigilo Corporativo — Requisições ilimitadas. Garantia contratual de que nenhum dado é armazenado ou utilizado para treinamento.' },
      { icon: Building2, text: 'Infraestrutura Local / Docker — Modelos rodando on-premise ou em nuvem privada, sob sua governança.' },
      { icon: FlaskConical, text: 'Fine-tuning Exclusivo — Modelos customizados com seus dados para resultados precisos ao seu negócio.' },
      { icon: GitBranch, text: 'Treinamento de Equipe Incluso — Capacitação completa do seu time para extrair o máximo da plataforma.' },
      { icon: Cpu, text: 'SLA de Disponibilidade 99.9% — Garantia de uptime corporativo com suporte Nível 3.' },
    ],
    highlighted: false,
    tag: null,
    cta: 'Falar com Consultor',
    ctaAction: 'whatsapp' as const,
  },
};

const ROADMAP_FEATURES = [
  '🎬 Edição e geração de vídeo por IA',
  '🔧 Ferramentas de edição multimodal',
  '🌐 Agentes autônomos para automação de tarefas',
];

const TRIAL_CONFIG = {
  enabled: false,
  type: 'cpf' as 'generic' | 'cpf',
  durationDays: 1,
  message: 'Teste de 1 dia mediante validação de CPF.',
  paymentMessage: 'Acesso imediato após a confirmação do pagamento. Sem taxa de adesão ou fidelidade.',
};

const PricingPlans = () => {
  const navigate = useNavigate();
  const planKeys = Object.keys(PRICING_CONFIG) as (keyof typeof PRICING_CONFIG)[];
  const { ref, visibleItems } = useStaggeredAnimation(planKeys.length, 150);
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation({ triggerOnce: true });
  const { ref: footerRef, isVisible: footerVisible } = useScrollAnimation({ triggerOnce: true });

  return (
    <section
      id="precos"
      ref={ref}
      className="relative py-28 md:py-36 px-6 lg:px-[8%] overflow-hidden"
      aria-labelledby="pricing-title"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(var(--logo-violet),0.08)_0%,_transparent_70%)] bg-[linear-gradient(hsla(0,0%,100%,0.02)_1px,transparent_1px),linear-gradient(90deg,hsla(0,0%,100%,0.02)_1px,transparent_1px)] opacity-20" aria-hidden="true" style={{ backgroundSize: '96px 96px' }} />
      <div className="absolute top-1/4 -left-32 w-64 h-64 rounded-full bg-[hsl(var(--logo-violet))/0.08] blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 rounded-full bg-[hsl(var(--logo-cyan))/0.06] blur-3xl pointer-events-none" />

      <div className="relative max-w-[1728px] mx-auto px-6 md:px-10 lg:px-16">
        {/* Header */}
        <div ref={headerRef} className={`text-center max-w-3xl mx-auto mb-16 scroll-reveal ${headerVisible ? 'is-visible' : ''}`}>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide bg-[hsl(var(--logo-violet))/0.12] border border-[hsl(var(--logo-violet))/0.25] text-logo-violet-light mb-6 inline-block">
            <LayoutGrid size={14} className="text-logo-violet-light" />
            Planos e Preços
          </span>
          <h2 id="pricing-title" className="font-display text-display-md font-semibold leading-tight">
            Invista no seu{' '}
            <span className="text-gradient-brand">potencial com IA</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Escolha o plano ideal para suas necessidades. Todos os planos oferecem acesso ao
            ecossistema completo de IA da Francos Corp, com níveis de prioridade e recursos progressivos.
          </p>
        </div>

        {/* Cards Grid - Fixed overflow with proper min-width */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {planKeys.map((key, index) => {
            const plan = PRICING_CONFIG[key];
            const PlanIcon = plan.icon;
            const isVisible = visibleItems.has(index);

            return (
              <article
                key={key}
                className={`relative flex flex-col rounded-3xl transition-all duration-500 group scroll-reveal-scale ${
                  plan.highlighted
                    ? 'bg-gradient-to-b from-[hsl(265,85%,8%)] to-[hsl(var(--card))] border-2 border-[hsl(var(--logo-violet))/0.5] shadow-[0_0_80px_hsla(var(--logo-violet),0.15),0_8px_32px_rgba(0,0,0,0.4)] z-10'
                    : 'bg-[hsl(var(--card))/0.8] border border-card-border hover:border-[hsl(var(--logo-violet))/0.3]'
                }`}
                style={{
                  transitionDelay: `${index * 150}ms`,
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? 'scale(1)' : 'scale(0.92)',
                }}
              >
                {/* Highlight Tag */}
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                    <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-[hsl(var(--logo-violet))] to-[hsl(280,85%,55%)] text-white text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-[0.1em] shadow-lg shadow-[hsl(var(--logo-violet))/0.4]">
                      <Sparkles size={12} />
                      {plan.tag}
                    </span>
                  </div>
                )}

                {/* Card Content */}
                <div className="p-7 md:p-8 pb-0 flex-1 flex flex-col">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-500 group-hover:scale-110 ${
                    plan.highlighted
                      ? 'bg-[linear-gradient(135deg,_hsl(var(--logo-violet)/0.25)_0%,_hsl(var(--logo-cyan)/0.15)_100%)]'
                      : 'bg-[hsl(var(--muted))/0.5]'
                  }`}>
                    <PlanIcon size={24} className={plan.highlighted ? 'text-logo-violet-light' : 'text-muted-foreground'} />
                  </div>

                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{plan.subtitle}</p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1.5 mb-6">
                    <span className="font-display text-4xl font-extrabold tracking-tight">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed min-h-[48px] mb-6 flex-1">
                    {plan.description}
                  </p>
                </div>

                {/* Features List */}
                <div className="px-7 md:px-8 mt-6 flex-1">
                  <ul className="space-y-3.5" role="list">
                    {plan.features.map((feature, idx) => {
                      const FeatureIcon = feature.icon;
                      return (
                        <li key={idx} className="flex items-start gap-3 text-sm text-foreground">
                          <FeatureIcon
                            size={14}
                            className={`mt-0.5 shrink-0 ${plan.highlighted ? 'text-logo-violet-light' : 'text-muted-foreground'}`}
                            aria-hidden="true"
                          />
                          <span className="leading-snug">{feature.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Roadmap (Pro & Enterprise) */}
                {(key === 'pro' || key === 'enterprise') && (
                  <div className="px-7 md:px-8 mt-6 border-t border-card-border pt-5">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-3">
                      Em breve no seu plano
                    </p>
                    <ul className="space-y-2" role="list">
                      {ROADMAP_FEATURES.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Atom size={10} className="text-[hsl(var(--logo-violet))/0.6] shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* CTA */}
                <div className="px-7 md:px-8 pb-7 md:pb-8 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      if (plan.ctaAction === 'whatsapp') {
                        window.open('https://wa.me/5562985835588', '_blank', 'noopener,noreferrer');
                      } else {
                        navigate('/register');
                      }
                    }}
                    className={`w-full py-3.5 px-4 rounded-2xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                      plan.highlighted
                        ? 'bg-gradient-to-r from-[hsl(var(--logo-violet))] to-[hsl(280,85%,55%)] hover:from-[hsl(var(--logo-violet-light))] hover:to-[hsl(var(--logo-cyan))] text-white shadow-lg shadow-[hsl(var(--logo-violet))/0.4] hover:shadow-[hsl(var(--logo-violet))/0.5] active:scale-[0.98]'
                        : 'bg-[hsl(var(--muted))/0.5] hover:bg-muted text-foreground hover:shadow-lg active:scale-[0.98]'
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* Glow effect on highlighted */}
                {plan.highlighted && (
                  <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-[hsl(var(--logo-violet))/0.15] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                )}
              </article>
            );
          })}
        </div>

        {/* Footer: Payment policy & Roadmap */}
        <div ref={footerRef} className={`mt-16 scroll-reveal ${footerVisible ? 'is-visible' : ''}`} style={{ transitionDelay: '300ms' }}>
          <div className="text-center mb-4">
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-[hsl(var(--muted))/0.3] border border-card-border rounded-full px-5 py-2.5">
              <Users size={14} />
              <span>{TRIAL_CONFIG.paymentMessage}</span>
            </div>
          </div>

          {TRIAL_CONFIG.enabled && (
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 text-xs text-[hsl(150,70%,50%)] bg-[hsl(150,70%,50%)/0.08] border border-[hsl(150,70%,50%)/0.2] rounded-full px-5 py-2.5">
                <Sparkles size={14} />
                <span>🎉 {TRIAL_CONFIG.durationDays} dia de teste grátis{TRIAL_CONFIG.type === 'cpf' ? ' mediante validação de CPF' : ''}!</span>
              </div>
            </div>
          )}

          <div className="text-center">
            <p className="text-[11px] text-muted-foreground">
              Ecossistema em constante evolução.{' '}
              <span className="text-[hsl(var(--muted-foreground))/0.7]">
                Edição de vídeo, agentes autônomos e mais estão no roadmap.
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingPlans;