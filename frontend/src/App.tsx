// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { registerMediaNavigator, unregisterMediaNavigator } from './lib/mediaSession';
import { ToastProvider } from './hooks/useToast';
import { ToastContainer } from './components/ui/Toast';
import { MediaToastProvider } from './components/media/MediaToast';
import { PageLoading } from './components/ui/LoadingSpinner';
import { invalidateCache } from './services/media/cache';

import ProtectedRoute from './components/ProtectedRoute';
import MediaProtectedRoute from './components/MediaProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Header from './components/Header';
import CookieConsent from './components/CookieConsent';
import { Provider } from 'react-redux';
import { store } from './redux/store';
import { SystemPromptsProvider } from './contexts/SystemPromptsContext';
import { I18nProvider } from './i18n';
import Hero from './sections/Hero';
import Funcionalidades from './sections/Funcionalidades';
import Footer from './sections/Footer';
import SectionBackground from './components/SectionBackground';

const PricingPlans = lazy(() => import('./sections/PricingPlans'));
const Narrativa = lazy(() => import('./sections/Narrativa'));
const Depoimentos = lazy(() => import('./sections/Depoimentos'));
const Faq = lazy(() => import('./sections/Faq'));
const CTAFinal = lazy(() => import('./sections/CTAFinal'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const FilaEspera = lazy(() => import('./sections/FilaEspera'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const ToolsHub = lazy(() => import('./pages/ToolsHub'));
const Documents = lazy(() => import('./pages/Documents'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const OAuthSuccess = lazy(() => import('./pages/OAuthSuccess'));
const AdminLeads = lazy(() => import('./pages/AdminLeads'));

// ─── Media Server ─────────────────────────────────────────
const MediaLogin = lazy(() => import('./pages/media/Login'));
const MediaDashboard = lazy(() => import('./pages/media/Dashboard'));
const MediaSearch = lazy(() => import('./pages/media/Search'));

const MediaWatch = lazy(() => import('./pages/media/Watch'));
const MediaDownloads = lazy(() => import('./pages/media/Downloads'));
const MediaLibrary = lazy(() => import('./pages/media/Library'));
const MediaSettings = lazy(() => import('./pages/media/Settings'));
const MediaUsers = lazy(() => import('./pages/media/Users'));
const MediaPlayer = lazy(() => import('./pages/media/Player'));


function SectionLoading() {
  return (
    <div className="py-24 px-6 lg:px-[8%]">
      <div className="max-w-[960px] mx-auto">
        <div className="w-full h-64 bg-[#0F172A]/30 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname.startsWith('/dashboard');
  const isMedia = location.pathname.startsWith('/dolfimflix');

  useEffect(() => {
    registerMediaNavigator((path: string) => navigate(path, { replace: true }));
    return () => unregisterMediaNavigator();
  }, [navigate]);

  return (
    <>
      <ToastContainer />

      {/* Header Fixo/Sticky - escondido no dashboard e nas rotas do DolfimFlix */}
      {!isDashboard && !isMedia && <Header />}      <CookieConsent />

      <Routes>

        {/* Home Page */}
        <Route path="/" element={
          <>
            <Hero />
            <Funcionalidades />
            <Suspense fallback={<SectionLoading />}>
              <PricingPlans />
            </Suspense>
            <Suspense fallback={<SectionLoading />}>
              <Narrativa />
            </Suspense>
            <Suspense fallback={<SectionLoading />}>
              <Depoimentos />
            </Suspense>
            <Suspense fallback={<SectionLoading />}>
              <Faq />
            </Suspense>
            <Suspense fallback={<SectionLoading />}>
              <CTAFinal />
            </Suspense>
            <Footer />
          </>
        } />

        {/* Login */}
        <Route path="/login" element={
          <Suspense fallback={<PageLoading label="Carregando..." />}>
            <Login />
          </Suspense>
        } />

        {/* Register */}
        <Route path="/register" element={
          <Suspense fallback={<PageLoading label="Carregando..." />}>
            <Register />
          </Suspense>
        } />

        {/* Forgot Password */}
        <Route path="/forgot-password" element={
          <Suspense fallback={<PageLoading label="Carregando..." />}>
            <ForgotPassword />
          </Suspense>
        } />

        {/* Reset Password */}
        <Route path="/reset-password" element={
          <Suspense fallback={<PageLoading label="Carregando..." />}>
            <ResetPassword />
          </Suspense>
        } />

        {/* Verify Email */}
        <Route path="/verify-email" element={
          <Suspense fallback={<PageLoading label="Verificando..." />}>
            <VerifyEmail />
          </Suspense>
        } />

        {/* OAuth Callback (Google) */}
        <Route path="/oauth" element={
          <Suspense fallback={<PageLoading label="Autenticando..." />}>
            <OAuthSuccess />
          </Suspense>
        } />

        {/* Admin Leads (protegida — somente admin) */}
        <Route path="/adminlea" element={
          <AdminRoute>
            <Suspense fallback={<PageLoading label="Carregando painel..." />}>
              <AdminLeads />
            </Suspense>
          </AdminRoute>
        } />

        {/* Fila de Espera */}
        <Route path="/fila-espera" element={
          <Suspense fallback={<PageLoading label="Carregando..." />}>
            <FilaEspera />
          </Suspense>
        } />

        {/* Tools Hub */}
        <Route path="/tools" element={
          <Suspense fallback={<PageLoading label="Carregando hub de ferramentas..." />}>
            <ToolsHub />
          </Suspense>
        } />

        {/* Documentos (PDF/Word/QR) — página standalone */}
        <Route path="/documentos" element={
          <Suspense fallback={<PageLoading label="Carregando documentos..." />}>
            <Documents />
          </Suspense>
        } />

        {/* Configuracoes (protegida) */}
        <Route path="/dashboard/configuracoes" element={
          <ProtectedRoute>
            <Suspense fallback={<PageLoading label="Carregando..." />}>
              <Settings />
            </Suspense>
          </ProtectedRoute>
        } />

        {/* Dashboard / Chat IA (protegida) */}
        <Route path="/dashboard/*" element={
          <ProtectedRoute>
            <Suspense fallback={<PageLoading label="Carregando dashboard..." />}>
              <Dashboard />
            </Suspense>
          </ProtectedRoute>
        } />

        {/* ─── DolfimFlix ──────────────────────────────────── */}
        <Route path="/dolfimflix/login" element={
          <Suspense fallback={<PageLoading label="Carregando..." />}>
            <MediaLogin />
          </Suspense>
        } />
        <Route path="/dolfimflix" element={
          <MediaProtectedRoute>
            <MediaToastProvider>
              <Suspense fallback={<PageLoading label="Carregando..." />}>
                <MediaDashboard />
              </Suspense>
            </MediaToastProvider>
          </MediaProtectedRoute>
        } />
        <Route path="/dolfimflix/buscar" element={
          <MediaProtectedRoute>
            <MediaToastProvider>
              <Suspense fallback={<PageLoading label="Carregando..." />}>
                <MediaSearch />
              </Suspense>
            </MediaToastProvider>
          </MediaProtectedRoute>
        } />
        <Route path="/dolfimflix/downloads" element={
          <MediaProtectedRoute>
            <MediaToastProvider>
              <Suspense fallback={<PageLoading label="Carregando..." />}>
                <MediaDownloads />
              </Suspense>
            </MediaToastProvider>
          </MediaProtectedRoute>
        } />
        <Route path="/dolfimflix/assistir" element={
          <MediaProtectedRoute>
            <MediaToastProvider>
              <Suspense fallback={<PageLoading label="Carregando..." />}>
                <MediaWatch />
              </Suspense>
            </MediaToastProvider>
          </MediaProtectedRoute>
        } />
        <Route path="/dolfimflix/biblioteca" element={
          <MediaProtectedRoute>
            <MediaToastProvider>
              <Suspense fallback={<PageLoading label="Carregando..." />}>
                <MediaLibrary />
              </Suspense>
            </MediaToastProvider>
          </MediaProtectedRoute>
        } />
        <Route path="/dolfimflix/configuracoes" element={
          <MediaProtectedRoute>
            <MediaToastProvider>
              <Suspense fallback={<PageLoading label="Carregando..." />}>
                <MediaSettings />
              </Suspense>
            </MediaToastProvider>
          </MediaProtectedRoute>
        } />
        <Route path="/dolfimflix/usuarios" element={
          <MediaProtectedRoute>
            <MediaToastProvider>
              <Suspense fallback={<PageLoading label="Carregando..." />}>
                <MediaUsers />
              </Suspense>
            </MediaToastProvider>
          </MediaProtectedRoute>
        } />
        <Route path="/dolfimflix/play/:id" element={
          <MediaProtectedRoute>
            <MediaToastProvider>
              <Suspense fallback={<PageLoading label="Carregando player..." />}>
                <MediaPlayer />
              </Suspense>
            </MediaToastProvider>
          </MediaProtectedRoute>
        } />

        {/* Catch-all */}
        <Route path="*" element={
          <>
            <Hero />
            <Footer />
          </>
        } />
      </Routes>
    </>
  );
}

export default function App() {
  // Invalidate all caches on app mount to ensure fresh data
  useEffect(() => {
    invalidateCache();
  }, []);

  return (
    <Provider store={store}>
      <ToastProvider>
        <I18nProvider>
          <SystemPromptsProvider>
            <AppLayout />
          </SystemPromptsProvider>
        </I18nProvider>
      </ToastProvider>
    </Provider>
  );
}