// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { useState } from 'react';
import { Mail, Phone, User, Send, CheckCircle, AlertCircle } from 'lucide-react';

const FilaEspera = () => {
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: ''
  });

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.nome) {
      setFeedback({ type: 'info', text: 'Preencha pelo menos seu nome e e-mail para continuar.' });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          name: formData.nome,
          interest: formData.telefone || 'Geral' // Usando telefone como campo de interesse se preenchido
        })
      });

      const data = await response.json();

      if (response.ok) {
        setFeedback({ type: 'success', text: 'Inscrição realizada com sucesso! Assim que uma vaga for liberada, entraremos em contato pelo e-mail informado.' });
        
        setTimeout(() => {
          setFormData({ nome: '', email: '', telefone: '' });
          setFeedback(null);
        }, 4000);
      } else {
        const serverMsg = data?.error?.message || data?.message || '';
        const userMsg =
          serverMsg.includes('já está na fila')
            ? 'Você já está na fila de espera! Fique tranquilo, entraremos em contato assim que possível.'
            : serverMsg.includes('já possui uma conta')
              ? 'Este e-mail já possui uma conta cadastrada. Faça login para acessar seus recursos.'
              : serverMsg || 'Não foi possível completar sua solicitação. Verifique os dados e tente novamente.';
        setFeedback({ type: 'error', text: userMsg });
      }
    } catch (error) {
      console.error('Erro ao enviar formulário:', error);
      setFeedback({ type: 'error', text: 'Erro de conexão com o servidor. Verifique sua internet e tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <section 
      id="fila-espera"
      className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-[#0a0f1c] via-[#0d1524] to-[#162038]"
    >
      {/* Background com gradiente sutil */}
      <div className="absolute inset-0">
        <div 
          className="absolute top-[-10%] left-[50%] -translate-x-1/2 w-[70vw] h-[50vh]"
          style={{ background: 'radial-gradient(circle at 40% 30%, rgba(167, 139, 250, 0.06) 0%, transparent 70%)' }} 
        />
        
        {/* Grid sutil no fundo */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`, backgroundSize: '4rem 4rem' }} 
        />
      </div>

      {/* Conteúdo principal */}
      <div className="relative z-10 min-h-screen flex flex-col justify-center px-6 lg:px-[8%]">
        <div className="max-w-3xl mx-auto text-center">
          
          {/* Título */}
          <h2 
            className="font-display text-display-xl mb-4 leading-tight"
            style={{ color: '#A78BFA' }}
          >
            Fila de Espera
          </h2>

          {/* Subtítulo */}
          <p 
            className="text-lg md:text-xl text-[#A78BFA]/70 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            Preencha seus dados e entraremos em contato assim que uma vaga estiver disponível.
          </p>

          {/* Formulário */}
          <div className="max-w-xl mx-auto">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Campo Nome */}
              <div className="relative group">
                <input
                  type="text"
                  name="nome"
                  id="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  placeholder="Seu nome completo"
                  required
                  disabled={loading}
                  className="w-full pl-12 pr-5 py-4 rounded-xl border border-white/10 bg-white/[0.03] text-white placeholder:text-[#A78BFA]/40 focus:outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all duration-300 disabled:opacity-50"
                />
                <User 
                  size={18} 
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A78BFA]/40 group-focus-within:text-primary-light transition-colors duration-300" 
                  aria-hidden="true"
                />
              </div>

              {/* Campo Email */}
              <div className="relative group">
                <input
                  type="email"
                  name="email"
                  id="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Seu melhor e-mail"
                  required
                  disabled={loading}
                  className="w-full pl-12 pr-5 py-4 rounded-xl border border-white/10 bg-white/[0.03] text-white placeholder:text-[#A78BFA]/40 focus:outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all duration-300 disabled:opacity-50"
                />
                <Mail 
                  size={18} 
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A78BFA]/40 group-focus-within:text-primary-light transition-colors duration-300" 
                  aria-hidden="true"
                />
              </div>

              {/* Campo Telefone */}
              <div className="relative group">
                <input
                  type="tel"
                  name="telefone"
                  id="telefone"
                  value={formData.telefone}
                  onChange={handleChange}
                  placeholder="(00) 00000-0000"
                  disabled={loading}
                  className="w-full pl-12 pr-5 py-4 rounded-xl border border-white/10 bg-white/[0.03] text-white placeholder:text-[#A78BFA]/40 focus:outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all duration-300 disabled:opacity-50"
                />
                <Phone 
                  size={18} 
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A78BFA]/40 group-focus-within:text-primary-light transition-colors duration-300" 
                  aria-hidden="true"
                />
              </div>

              {/* Botão Enviar */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full flex items-center justify-center gap-3 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium px-6 py-4 rounded-xl transition-all duration-300 shadow-lg shadow-primary/20 hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar Solicitação</span>
                    <Send size={18} />
                  </>
                )}
              </button>

            </form>
          </div>

          {/* Informações adicionais */}
          {/* Mensagem de feedback */}
          {feedback && (
            <div 
              className={`mt-8 p-4 rounded-xl text-sm flex items-start gap-3 ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : feedback.type === 'error'
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
              }`}
              role="alert"
            >
              {feedback.type === 'success' ? (
                <CheckCircle size={18} className="mt-0.5 shrink-0" />
              ) : (
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
              )}
              <p>{feedback.text}</p>
            </div>
          )}

          <p 
            className="mt-4 text-sm text-[#A78BFA]/50"
          >
            Ao se cadastrar, você concorda com nossos termos de uso e política de privacidade.
          </p>

        </div>
      </div>

    </section>
  );
};

export default FilaEspera;
