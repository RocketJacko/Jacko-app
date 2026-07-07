import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { m } from "motion/react";
import { ActivateOverlay } from "./components/canvas/ActivateOverlay";
import { DockNav } from "./components/layout/DockNav";
import { MemberHeader } from "./components/layout/MemberHeader";
import { HomePage } from "./pages/HomePage";
import { ProfileCompletionModal } from "./components/modals/ProfileCompletionModal";
import { SupportTicketModal } from "./components/modals/SupportTicketModal";
import { NetworkBanner } from "./components/layout/NetworkBanner";
import { useAuth } from "./context/AuthContext";
import { warmupConnection } from "./lib/supabaseClient";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { ChatBot } from "./components/ui/ChatBot";
import { ViewSlot } from "./components/layout/ViewSlot";
import { LoadingScreen } from "./components/layout/LoadingScreen";
import { usePaymentRedirects } from "./hooks/usePaymentRedirects";
import "./App.css";

// ─── Tipos ───────────────────────────────────────────────────────────────────
export type AppView = 'landing' | 'dashboard' | 'catalogo' | 'admin' | 'profile';

// ─── Lazy views ──────────────────────────────────────────────────────────────
const DashboardView = lazy(() =>
  import('./components/views/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const CatalogView = lazy(() =>
  import('./components/views/CatalogView').then((m) => ({ default: m.CatalogView }))
);
const AdminDashboardView = lazy(() =>
  import('./components/views/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView }))
);
const ProfileView = lazy(() =>
  import('./components/views/ProfileView').then((m) => ({ default: m.ProfileView }))
);

// ─── ViewFallback ─────────────────────────────────────────────────────────────
function ViewFallback() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        color: 'var(--brown-dark)',
      }}
    >
      <m.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        style={{
          border: '3px solid rgba(212, 98, 26, 0.1)',
          borderTop: '3px solid var(--orange-base)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
        }}
      />
      <p style={{ marginTop: '16px', fontSize: '0.9rem', fontWeight: 500, opacity: 0.8 }}>
        Cargando sección...
      </p>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [isIntroFinished, setIsIntroFinished] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isVerifyingRedirect, setIsVerifyingRedirect] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<'panel' | 'history'>('panel');
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const { session, isSessionLoading, isStaff, isSuperAdmin } = useAuth();

  // Escuchar el evento global para abrir el modal de soporte
  useEffect(() => {
    const handleOpenSupport = () => {
      setIsSupportModalOpen(true);
    };
    window.addEventListener('open-support-modal', handleOpenSupport);
    return () => {
      window.removeEventListener('open-support-modal', handleOpenSupport);
    };
  }, []);

  // Ref para evitar stale closures en efectos asíncronos
  const currentViewRef = useRef(currentView);
  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  // Calentar la conexión con Supabase al arrancar (free-tier duerme por inactividad)
  useEffect(() => {
    warmupConnection();
  }, []);

  // Captura de redirecciones de pago
  usePaymentRedirects(session, setCurrentView, setIsVerifyingRedirect);

  // Redirección reactiva basada en sesión
  useEffect(() => {
    let active = true;
    const handleRedirect = async () => {
      await Promise.resolve();
      if (!active) return;
      if (isSessionLoading) return;
      if (session) {
        setIsIntroFinished(true);
        setShowProfileModal(true);
        if (currentViewRef.current === 'landing') {
          setCurrentView('dashboard');
          localStorage.removeItem('jacko_selected_plan');
          localStorage.removeItem('jacko_just_registered');
        }
      } else {
        setShowProfileModal(false);
        setCurrentView('landing');
      }
    };
    handleRedirect();
    return () => {
      active = false;
    };
  }, [session, isSessionLoading]);

  // Escuchador de navegación global para redirección directa
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent<{ view: AppView }>;
      if (customEvent.detail && customEvent.detail.view) {
        setCurrentView(customEvent.detail.view);
      }
    };
    window.addEventListener('app-navigate', handleNavigate);
    return () => {
      window.removeEventListener('app-navigate', handleNavigate);
    };
  }, []);

  // Callback de la intro
  const handleIntroComplete = (completed: boolean) => {
    if (isIntroFinished !== completed) {
      setIsIntroFinished(completed);
    }
  };

  // Pantalla de carga de sesión
  if (isSessionLoading) {
    return <LoadingScreen />;
  }

  // Render principal
  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
      {/* Banner global de estado de red */}
      <NetworkBanner />

      {/* Modal de perfil completo — bloqueante, se muestra sobre todo lo demás */}
      {session && showProfileModal && (
        <ProfileCompletionModal
          userId={session.user.id}
          userEmail={session.user.email || ''}
          onComplete={() => setShowProfileModal(false)}
        />
      )}

      {/* Overlay de verificación de redirección de PayPal */}
      {isVerifyingRedirect && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,10,10,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999, color: 'var(--white-warm)' }}>
          <m.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            style={{
              border: '3px solid rgba(212, 98, 26, 0.1)',
              borderTop: '3px solid var(--orange-base)',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              marginBottom: '16px'
            }}
          />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', fontWeight: 600 }}>
            Validando pago de PayPal, por favor espera...
          </p>
        </div>
      )}

      {/* Overlay de entrada - solo si no está logueado */}
      {!session && <ActivateOverlay onStart={() => console.log('Experiencia iniciada')} />}

      {/* DockNav — solo si NO hay sesión activa */}
      {!session && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, pointerEvents: 'none' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <DockNav
              isVisible={isIntroFinished}
              currentView={currentView as 'landing' | 'dashboard' | 'catalogo' | 'admin'}
              onViewChange={(view) => setCurrentView(view)}
              isStaff={isStaff}
            />
          </div>
        </div>
      )}

      {/* MemberHeader — solo con sesión activa y fuera del panel admin */}
      {session && currentView !== 'admin' && (
        <MemberHeader
          currentView={currentView}
          onViewChange={(view, tab) => {
            setCurrentView(view);
            if (view === 'dashboard' && tab) {
              setDashboardTab(tab);
            }
          }}
          isStaff={isStaff}
          userEmail={session.user.email || ''}
        />
      )}

      {/* Vistas keep-alive */}
      <main
        style={{
          flex: '1 0 auto',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: currentView === 'admin' ? '100vh' : 'auto',
          minHeight: currentView === 'admin' ? '100vh' : 'auto',
          overflow: currentView === 'admin' ? 'hidden' : 'visible',
          paddingTop: (session && currentView !== 'admin' && currentView !== 'landing') ? '80px' : '0'
        }}
      >
        {/* Landing — siempre disponible (no requiere sesión) */}
        <ViewSlot isActive={currentView === 'landing'}>
          <HomePage onComplete={handleIntroComplete} />
        </ViewSlot>

        {/* Dashboard — requiere sesión activa */}
        {session && (
          <ViewSlot isActive={currentView === 'dashboard'}>
            <ErrorBoundary>
              <Suspense fallback={<ViewFallback />}>
                <DashboardView
                  userId={session.user.id}
                  userEmail={session.user.email || ''}
                  onNavigateToCatalog={() => setCurrentView('catalogo')}
                  activeTab={dashboardTab}
                  setActiveTab={setDashboardTab}
                />
              </Suspense>
            </ErrorBoundary>
          </ViewSlot>
        )}

        {/* Catálogo — requiere sesión activa o modo invitado */}
        {(session || currentView === 'catalogo') && (
          <ViewSlot isActive={currentView === 'catalogo'}>
            <ErrorBoundary>
              <Suspense fallback={<ViewFallback />}>
                <CatalogView
                  userId={session ? session.user.id : 'guest'}
                  onRedeemSuccess={() => {
                    // Puede usarse para disparar recarga cruzada en el futuro
                  }}
                  onNavigateToDashboard={session ? () => setCurrentView('dashboard') : undefined}
                />
              </Suspense>
            </ErrorBoundary>
          </ViewSlot>
        )}

        {/* Perfil — requiere sesión activa */}
        {session && (
          <ViewSlot isActive={currentView === 'profile'}>
            <ErrorBoundary>
              <Suspense fallback={<ViewFallback />}>
                <ProfileView userId={session.user.id} userEmail={session.user.email || ''} />
              </Suspense>
            </ErrorBoundary>
          </ViewSlot>
        )}

        {/* Admin — requiere sesión activa + permisos de staff */}
        {session && isStaff && (
          <ViewSlot isActive={currentView === 'admin'} className="admin-view-slot">
            <ErrorBoundary>
              <Suspense fallback={<ViewFallback />}>
                <AdminDashboardView
                  userId={session.user.id}
                  userEmail={session.user.email || ''}
                  isSuperAdmin={isSuperAdmin}
                  onNavigate={(view) => setCurrentView(view)}
                />
              </Suspense>
            </ErrorBoundary>
          </ViewSlot>
        )}
      </main>

      {/* Botón flotante y ventana de chat de asistencia */}
      <ChatBot currentView={currentView} onViewChange={(view) => setCurrentView(view)} />

      {/* Modal de Tickets de Soporte */}
      <SupportTicketModal isOpen={isSupportModalOpen} onClose={() => setIsSupportModalOpen(false)} />
    </div>
  );
}
