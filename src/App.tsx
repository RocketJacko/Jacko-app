import { useState, useEffect, lazy, Suspense } from "react";
import { m, AnimatePresence } from "motion/react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { MemberHeader } from "./components/layout/MemberHeader";
import { ProfileCompletionModal } from "./components/modals/ProfileCompletionModal";
import { SupportTicketModal } from "./components/modals/SupportTicketModal";
import { NetworkBanner } from "./components/layout/NetworkBanner";
import { useAuth } from "./context/AuthContext";
import { warmupConnection } from "./lib/supabaseClient";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { ChatBot } from "./components/ui/ChatBot";
import { LoadingScreen } from "./components/layout/LoadingScreen";
import { usePaymentRedirects } from "./hooks/usePaymentRedirects";
import { CustomAlertModal } from "./components/views/dashboard/components/CustomAlertModal";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import "./App.css";

// ─── Tipos ───────────────────────────────────────────────────────────────────
export type AppView = 'landing' | 'dashboard' | 'catalogo' | 'admin' | 'profile';

// ─── Lazy Pages ──────────────────────────────────────────────────────────────
const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const CatalogPage = lazy(() =>
  import('./pages/CatalogPage').then((m) => ({ default: m.CatalogPage }))
);
const CheckoutPage = lazy(() =>
  import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage }))
);
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage }))
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
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [isVerifyingRedirect, setIsVerifyingRedirect] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<'panel' | 'history' | 'activities'>('panel');
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [globalModal, setGlobalModal] = useState<{ title: string; message: string } | null>(null);
  const [globalToast, setGlobalToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { session, isSessionLoading, isStaff } = useAuth();

  // Deducir currentView a partir del pathname de React Router
  const currentView: AppView = location.pathname.startsWith('/admin')
    ? 'admin'
    : location.pathname.startsWith('/dashboard')
    ? 'dashboard'
    : location.pathname.startsWith('/catalogo')
    ? 'catalogo'
    : 'landing';

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

  // Escuchar eventos globales para notificaciones (toasts y modals)
  useEffect(() => {
    const handleShowToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; type: 'success' | 'error' }>;
      if (customEvent.detail) {
        setGlobalToast(customEvent.detail);
      }
    };
    const handleShowModal = (e: Event) => {
      const customEvent = e as CustomEvent<{ title: string; message: string }>;
      if (customEvent.detail) {
        setGlobalModal(customEvent.detail);
      }
    };
    window.addEventListener('show-toast', handleShowToast);
    window.addEventListener('show-modal', handleShowModal);
    return () => {
      window.removeEventListener('show-toast', handleShowToast);
      window.removeEventListener('show-modal', handleShowModal);
    };
  }, []);

  // Limpiar el toast automáticamente tras 4 segundos
  useEffect(() => {
    if (globalToast) {
      const timer = setTimeout(() => {
        setGlobalToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [globalToast]);

  const showModal = (title: string, message: string) => {
    setGlobalModal({ title, message });
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setGlobalToast({ message, type });
  };

  // Calentar la conexión con Supabase al arrancar
  useEffect(() => {
    warmupConnection();
  }, []);

  // Captura de redirecciones de pago
  usePaymentRedirects(
    session,
    (view) => navigate(view === 'landing' ? '/' : `/${view}`),
    setIsVerifyingRedirect,
    showModal,
    showToast
  );

  // Redirección reactiva basada en sesión
  useEffect(() => {
    if (isSessionLoading) return;
    if (session) {
      setShowProfileModal(true);
      if (location.pathname === '/') {
        const pendingPlan = localStorage.getItem('jacko_trigger_checkout_slug');
        if (pendingPlan) {
          navigate("/checkout", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
        localStorage.removeItem('jacko_selected_plan');
        localStorage.removeItem('jacko_just_registered');
      }
    } else {
      setShowProfileModal(false);
    }
  }, [session, isSessionLoading, location.pathname, navigate]);


  // Pantalla de carga de sesión inicial
  if (isSessionLoading) {
    return <LoadingScreen />;
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
      {/* Banner global de estado de red */}
      <NetworkBanner />

      {/* Modal de perfil completo — bloqueante */}
      {session && showProfileModal && (
        <ProfileCompletionModal
          userId={session.user.id}
          userEmail={session.user.email || ''}
          onComplete={() => setShowProfileModal(false)}
        />
      )}

      {/* Modal de perfil del usuario — accesible voluntariamente */}
      {session && showUserProfileModal && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <ProfileView
              userId={session.user.id}
              userEmail={session.user.email || ''}
              onClose={() => setShowUserProfileModal(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Overlay de verificación de redirección de PayPal */}
      {isVerifyingRedirect && (
        <div className="paypal-redirect-overlay">
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

      {/* MemberHeader — solo con sesión activa y fuera del panel admin */}
      {session && currentView !== 'admin' && (
        <MemberHeader
          currentView={currentView}
          dashboardTab={dashboardTab}
          onViewChange={(view, tab) => {
            if (view === 'profile') {
              setShowUserProfileModal(true);
            } else {
              navigate(view === 'landing' ? '/' : `/${view}`);
              if (view === 'dashboard' && tab) {
                setDashboardTab(tab);
              }
            }
          }}
          isStaff={isStaff}
          userEmail={session.user.email || ''}
        />
      )}

      {/* Sistema de Rutas y Transición de Páginas */}
      <main
        style={{
          flex: '1 0 auto',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: currentView === 'admin' ? '100vh' : 'auto',
          minHeight: currentView === 'admin' ? '100vh' : 'auto',
          overflow: currentView === 'admin' ? 'hidden' : 'visible',
          paddingTop: (session && currentView !== 'admin' && currentView !== 'landing') ? 'clamp(60px, 8vw, 80px)' : '0'
        }}
      >
        <Suspense fallback={<ViewFallback />}>
          <Routes>
            {/* Ruta Landing Pública */}
            <Route path="/" element={<LandingPage />} />

            {/* Rutas Privadas del Usuario (Protegidas) */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage activeTab={dashboardTab} setActiveTab={setDashboardTab} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/catalogo"
              element={
                <ProtectedRoute>
                  <CatalogPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/checkout"
              element={
                <ProtectedRoute>
                  <CheckoutPage />
                </ProtectedRoute>
              }
            />

            {/* Rutas del Panel de Administración (Protegidas + Staff) */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireStaff>
                  <Navigate to="/admin/orders" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/:tab"
              element={
                <ProtectedRoute requireStaff>
                  <AdminPage />
                </ProtectedRoute>
              }
            />

            {/* Ruta fallback de redirección segura */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {/* Botón flotante y ventana de chat de asistencia */}
      <ChatBot currentView={currentView} onViewChange={(view) => navigate(view === 'landing' ? '/' : `/${view}`)} />

      {/* Modal de Tickets de Soporte */}
      <SupportTicketModal isOpen={isSupportModalOpen} onClose={() => setIsSupportModalOpen(false)} />

      {/* Toast global de pagos y estado */}
      <div className="custom-toast-container">
        <AnimatePresence>
          {globalToast && (
            <m.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={`custom-toast ${globalToast.type}`}
            >
              <div className="custom-toast-icon">
                {globalToast.type === 'success' && '✨'}
                {globalToast.type === 'error' && '⚠️'}
              </div>
              <div className="custom-toast-text">{globalToast.message}</div>
              <button
                type="button"
                className="custom-toast-close"
                onClick={() => setGlobalToast(null)}
              >
                ×
              </button>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal global de avisos */}
      <AnimatePresence>
        {globalModal && (
          <CustomAlertModal
            title={globalModal.title}
            message={globalModal.message}
            onClose={() => setGlobalModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
