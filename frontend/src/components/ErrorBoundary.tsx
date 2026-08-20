// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Label opcional para identificar qual parte da UI quebrou (ex: "Dashboard", "Chat") */
  fallbackLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ────────────────────────────────────────────────────────────────
 *  ErrorBoundary
 * ────────────────────────────────────────────────────────────────
 *
 * Captura erros de renderização do React e exibe uma tela de fallback
 * amigável, evitando a "Tela Branca da Morte" (White Screen of Death).
 *
 * Uso:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallbackLabel="Dashboard">
 *     <Dashboard />
 *   </ErrorBoundary>
 *
 * O botão "Recarregar" tenta recuperar a aplicação.
 * O botão "Voltar ao Início" navega para a raiz.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log detalhado para diagnóstico (visível no console do navegador)
    console.error('[ErrorBoundary] Erro capturado:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      label: this.props.fallbackLabel || 'App',
    });
  }

  handleReload = (): void => {
    // Tenta recuperar resetando o estado — se for erro transiente, funciona
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  handleHardReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const errorName = this.state.error?.name || 'Erro desconhecido';
      const errorMessage = this.state.error?.message || 'Ocorreu um erro inesperado ao carregar esta página.';
      const label = this.props.fallbackLabel || 'aplicação';

      return (
        <div className="min-h-screen bg-[#0D1117] flex items-center justify-center p-6">
          {/* Background decorativo */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:6rem_6rem]" />
            <div className="absolute top-1/4 -left-48 w-96 h-96 bg-red-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 w-full max-w-lg">
            {/* Card */}
            <div className="bg-[#0F172A]/80 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl p-8 md:p-10">
              {/* Ícone */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center mx-auto mb-6 border border-red-500/10">
                <AlertTriangle size={32} className="text-red-400" />
              </div>

              {/* Título */}
              <h1 className="text-xl md:text-2xl font-bold text-center mb-3 text-white">
                Ops! Algo deu errado
              </h1>

              {/* Descrição */}
              <p className="text-sm text-[#A1A1AA] text-center leading-relaxed mb-2">
                A <strong className="text-white">{label}</strong> encontrou um erro
                e não pôde ser carregada. Tente recarregar a página.
              </p>

              {/* Detalhe do erro (colapsado — visível apenas em dev) */}
              {import.meta.env.DEV && (
                <details className="mt-4 mb-6">
                  <summary className="text-xs text-[#6B7280] cursor-pointer hover:text-[#A1A1AA] transition-colors flex items-center gap-1.5">
                    <Bug size={12} />
                    <span>Detalhes do erro (desenvolvedor)</span>
                  </summary>
                  <div className="mt-2 p-3 rounded-lg bg-black/40 border border-red-500/10 overflow-auto max-h-40">
                    <p className="text-xs text-red-400 font-mono break-all">
                      {errorName}: {errorMessage}
                    </p>
                    {this.state.error?.stack && (
                      <pre className="mt-2 text-[10px] text-[#6B7280] font-mono whitespace-pre-wrap break-all leading-relaxed">
                        {this.state.error.stack}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              {/* Ações */}
              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button
                  onClick={this.handleReload}
                  className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-all duration-200 border border-white/10 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <RefreshCw size={16} />
                  <span>Tentar novamente</span>
                </button>

                <button
                  onClick={this.handleGoHome}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-500 text-white font-medium transition-all duration-200 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Home size={16} />
                  <span>Voltar ao início</span>
                </button>
              </div>

              {/* Hard reload (caso o soft reload não funcione) */}
              <div className="mt-4 text-center">
                <button
                  onClick={this.handleHardReload}
                  className="text-xs text-[#6B7280] hover:text-[#A1A1AA] transition-colors underline underline-offset-2"
                >
                  Recarregar página completamente (hard reload)
                </button>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-[#6B7280] mt-6">
              Se o erro persistir, entre em contato com o suporte.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
