// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App.tsx';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('[main] Elemento #root não encontrado no HTML!');
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0D1117;color:#fff;font-family:sans-serif;padding:20px;text-align:center;">
      <div>
        <h1 style="font-size:24px;margin-bottom:12px;">Erro de inicialização</h1>
        <p style="color:#A1A1AA;font-size:14px;">O container principal da aplicação não foi encontrado.</p>
      </div>
    </div>
  `;
} else {
  createRoot(rootElement).render(
    <BrowserRouter>
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    </BrowserRouter>
  );
}