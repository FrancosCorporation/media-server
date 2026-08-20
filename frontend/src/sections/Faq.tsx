// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { useStaggeredAnimation, useScrollAnimation } from '@/hooks/useScrollAnimation';

const faqs = [
  {
    question: 'Como funciona o teste gratuito?',
    answer: 'Oferecemos 14 dias de acesso completo sem necessidade de cartão de crédito. Você pode explorar todas as funcionalidades e gerar conteúdo ilimitadamente durante esse período.'
  },
  {
    question: 'Quais são os planos disponíveis?',
    answer: 'Temos planos Light, Pro e Enterprise com preços escalonados conforme suas necessidades. O plano Light inclui acesso básico às ferramentas principais por R$ 49,90/mês.'
  },
  {
    question: 'Posso cancelar quando quiser?',
    answer: 'Sim! Não há contratos de longo prazo ou penalidades por cancelamento. Você pode cancelar a qualquer momento pelo painel do usuário, mantendo o acesso até o fim do período pago.'
  },
  {
    question: 'Minhas gerações são salvas?',
    answer: 'Todas as suas criações, projetos e configurações são automaticamente salvos na nuvem. Acesse sua conta de qualquer dispositivo e continue exatamente onde parou.'
  },
  {
    question: 'A plataforma é segura para dados sensíveis?',
    answer: 'Sim! Utilizamos criptografia AES-256 em repouso e TLS 1.3 em trânsito. Cumprimos com GDPR, SOC2 Type II e outras normas de segurança enterprise. Seus dados nunca são usados para treinamento.'
  },
  {
    question: 'Existe suporte técnico disponível?',
    answer: 'Oferecemos suporte por e-mail para todos os planos, chat ao vivo nos planos Pro+, e acesso direto à nossa equipe de engenharia no plano Enterprise com SLA garantido.'
  }
];

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { ref, visibleItems } = useStaggeredAnimation(faqs.length, 80);
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation({ triggerOnce: true });

  return (
    <section
      id="faq"
      ref={ref}
      className="relative py-28 md:py-36 px-6 lg:px-[8%] overflow-hidden"
      aria-labelledby="faq-title"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(var(--logo-violet),0.08)_0%,_transparent_70%)] bg-[linear-gradient(hsla(0,0%,100%,0.02)_1px,transparent_1px),linear-gradient(90deg,hsla(0,0%,100%,0.02)_1px,transparent_1px)] opacity-20" aria-hidden="true" style={{ backgroundSize: '96px 96px' }} />

      <div className="relative max-w-[1728px] mx-auto px-6 md:px-10 lg:px-16">
        {/* Header */}
        <div ref={headerRef} className={`text-center max-w-3xl mx-auto mb-16 scroll-reveal ${headerVisible ? 'is-visible' : ''}`}>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide bg-[hsl(var(--logo-violet))/0.12] border border-[hsl(var(--logo-violet))/0.25] text-logo-violet-light mb-6 inline-block">
            <HelpCircle size={14} className="text-logo-violet-light" />
            Perguntas Frequentes
          </span>
          <h2 id="faq-title" className="font-display text-display-md font-semibold leading-tight">
            Dúvidas{' '}
            <span className="text-gradient-brand">comuns</span> respondidas
          </h2>
        </div>

        {/* Accordion */}
        <div className="space-y-3 max-w-3xl mx-auto">
          {faqs.map((faq, index) => (
            <details
              key={faq.question}
              className={`scroll-reveal group overflow-hidden rounded-2xl border transition-all duration-300 ${
                openIndex === index
                  ? 'border-[hsl(var(--logo-violet))/0.3] shadow-[0_0_40px_hsla(var(--logo-violet),0.1)]'
                  : 'border-card-border'
              } bg-[hsl(var(--card))/0.6]`}
              style={{
                transitionDelay: `${index * 50}ms`,
                opacity: visibleItems.has(index) ? 1 : 0,
                transform: visibleItems.has(index) ? 'translateY(0)' : 'translateY(20px)',
              }}
            >
              <summary
                className="flex items-center justify-between w-full px-6 py-5 text-left cursor-pointer list-none focus-ring"
                onClick={(e) => {
                  e.preventDefault();
                  setOpenIndex(openIndex === index ? null : index);
                }}
              >
                <span className="font-medium pr-8 text-foreground">
                  {faq.question}
                </span>

                <ChevronDown
                  size={20}
                  className={`text-muted-foreground transition-transform duration-300 flex-shrink-0 ${
                    openIndex === index ? 'rotate-180 text-logo-violet-light' : ''
                  }`}
                  aria-hidden="true"
                />
              </summary>

              <div className="px-6 pb-5 text-muted-foreground leading-relaxed animate-fade-in-scale">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;