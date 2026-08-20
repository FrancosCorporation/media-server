// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useEffect } from 'react';
import { X, Cookie, Shield, Info } from 'lucide-react';

const COOKIE_CONSENT_KEY = 'francos-cookie-consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Delay para não aparecer imediatamente ao entrar
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'rejected');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] animate-in slide-in-from-bottom-8 duration-500 px-4 pb-4"
      role="dialog"
      aria-label="Aviso de cookies e privacidade"
    >
      <div className="max-w-3xl mx-auto bg-[#0F172A]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6">
        <div className="flex items-start gap-4">
          {/* Ícone */}
          <div className="hidden sm:flex w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex-shrink-0 items-center justify-center shadow-lg shadow-primary/20">
            <Cookie size={24} className="text-white" />
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold text-white mb-1">
                  🍪 Cookies & Privacidade
                </h3>
                <p className="text-sm text-[#A1A1AA] leading-relaxed">
                  A Francos Corp utiliza cookies apenas para fins estatísticos e de 
                  funcionamento essencial da plataforma. Não coletamos dados pessoais 
                  para fins comerciais ou lucrativos.
                </p>
              </div>
              <button
                onClick={handleReject}
                className="p-1.5 rounded-lg hover:bg-white/5 text-[#6B7280] hover:text-white transition-colors flex-shrink-0"
                aria-label="Fechar aviso"
              >
                <X size={18} />
              </button>
            </div>

            {/* Detalhes expansíveis */}
            {showDetails && (
              <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-start gap-3">
                  <Shield size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white mb-1">Cookies Essenciais</p>
                    <p className="text-xs text-[#A1A1AA] leading-relaxed">
                      Utilizamos cookies necessários para o funcionamento da plataforma, 
                      como autenticação e segurança. Estes não requerem consentimento prévio.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Info size={16} className="text-primary-light flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white mb-1">Sem Fins Lucrativos</p>
                    <p className="text-xs text-[#A1A1AA] leading-relaxed">
                      A Francos Corp é um projeto de código aberto sem fins lucrativos. 
                      Seus dados são utilizados exclusivamente para melhorar a experiência 
                      de uso e não são compartilhados com terceiros para fins comerciais.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Cookie size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white mb-1">Estatísticas Anônimas</p>
                    <p className="text-xs text-[#A1A1AA] leading-relaxed">
                      Podemos coletar dados anônimos de uso para entender como a plataforma 
                      está sendo utilizada e melhorar continuamente nossos serviços.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-[#6B7280] italic mt-2">
                  Ao continuar navegando, você concorda com o uso de cookies essenciais. 
                  Os cookies de estatística são opcionais e podem ser recusados.
                </p>
              </div>
            )}

            {/* Botões */}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button
                onClick={handleAccept}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white text-sm font-medium transition-all duration-300 shadow-lg shadow-primary/20"
              >
                Aceitar cookies
              </button>
              <button
                onClick={handleReject}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white text-sm font-medium transition-all duration-300 border border-white/10"
              >
                Recusar estatísticos
              </button>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-primary-light hover:text-primary-light/80 transition-colors underline underline-offset-2"
              >
                {showDetails ? 'Ocultar detalhes' : 'Saber mais'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
