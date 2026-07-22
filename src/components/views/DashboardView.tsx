import { useState, useEffect, useCallback } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabaseClient';
import { invalidateCache, invalidateCacheByPrefix } from '../../lib/queryCache';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { RefreshCw, Ticket, Loader2 } from 'lucide-react';
import './DashboardView.css';
import { userService } from '../../services/userService';

// Import subcomponents
import { DashboardStats } from './dashboard/DashboardStats';
import { DashboardHistory } from './dashboard/DashboardHistory';
import { ActivitiesDashboard } from './dashboard/ActivitiesDashboard';

// Import types
import type { Profile, Order } from './dashboard/types';

interface Props {
  userId: string;
  userEmail: string;
  onNavigateToCatalog: () => void;
  activeTab?: 'panel' | 'history' | 'activities';
  setActiveTab?: (tab: 'panel' | 'history' | 'activities') => void;
}

export function DashboardView({
  userId,
  userEmail,
  onNavigateToCatalog,
  activeTab: externalActiveTab,
}: Props) {
  const activeTab = externalActiveTab !== undefined ? externalActiveTab : 'panel';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [isRedeemingCode, setIsRedeemingCode] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(
    null
  );

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const { justReconnected } = useNetworkStatus();

  const loadData = useCallback(
    async (forceRefresh = false) => {
      // Carga optimista: si ya hay datos en estado (keep-alive o cache L1),
      // no mostrar el spinner — el usuario ve contenido inmediatamente.
      if (!profile) setIsLoading(true);
      setErrorMsg('');
      try {
        const data = await userService.getDashboardData(userId, forceRefresh);
        setProfile(data.profile);
        setOrders(data.orders);
      } catch (err: unknown) {
        console.error('Error loading dashboard data:', err);
        const msg = !navigator.onLine
          ? 'Sin conexión a internet. Los datos se recargarán automáticamente al reconectarte.'
          : 'No se pudo cargar la información. Intenta de nuevo.';
        setErrorMsg(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [userId, profile]
  );

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitationCode.trim() || isRedeemingCode) return;

    setIsRedeemingCode(true);
    try {
      const result = await userService.redeemInvitationCode(invitationCode.trim());
      if (result.success) {
        setInvitationCode('');
        invalidateCache('dashboard_data_' + userId);
        invalidateCacheByPrefix('catalog_products');
        await loadData(true);
        
        window.dispatchEvent(
          new CustomEvent('show-toast', {
            detail: { message: '¡Código canjeado!', type: 'success' },
          })
        );
        window.dispatchEvent(
          new CustomEvent('show-modal', {
            detail: {
              title: '¡Bienvenido VIP!',
              message: result.message || 'El código de invitación ha sido procesado correctamente. Ahora eres un miembro invitado.',
            },
          })
        );
      } else {
        window.dispatchEvent(
          new CustomEvent('show-toast', {
            detail: { message: 'Error al canjear', type: 'error' },
          })
        );
        window.dispatchEvent(
          new CustomEvent('show-modal', {
            detail: {
              title: 'Error de Canje',
              message: result.message || 'No se pudo canjear el código de invitación.',
            },
          })
        );
      }
    } catch (err: unknown) {
      console.error('Error redeeming invitation code:', err);
      const msg = err instanceof Error ? err.message : 'Error al procesar el código.';
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: { message: 'Error de conexión', type: 'error' },
        })
      );
      window.dispatchEvent(
        new CustomEvent('show-modal', {
          detail: {
            title: 'Error de Canje',
            message: msg,
          },
        })
      );
    } finally {
      setIsRedeemingCode(false);
    }
  };

  // Auto-reload on network reconnection
  useEffect(() => {
    if (justReconnected) {
      invalidateCache('dashboard_data_' + userId);
      const run = async () => {
        await Promise.resolve();
        loadData(true);
      };
      run();
    }
  }, [justReconnected, userId, loadData]);

  useEffect(() => {
    let active = true;
    const fetchAsync = async () => {
      await Promise.resolve();
      if (active) {
        await loadData(false);
      }
    };
    fetchAsync();
    return () => {
      active = false;
    };
  }, [loadData]);

  // Realtime subscription for order changes
  useEffect(() => {
    const channel = supabase
      .channel(`dashboard_orders_realtime_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` },
        async (payload) => {
          console.log('Cambio detectado en órdenes mediante Realtime:', payload);
          invalidateCache('dashboard_data_' + userId);
          invalidateCacheByPrefix('catalog_products');
          await loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadData]);

  const formatCOP = (val: number | null) => {
    if (!val) return '$0 COP';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="dashboard-container">
      {/* Toast de Notificaciones Personalizado */}
      <AnimatePresence>
        {toast && (
          <m.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={`toast-message ${toast.type}`}
          >
            <div className="toast-icon">
              {toast.type === 'success' && '✨'}
              {toast.type === 'error' && '⚠️'}
              {toast.type === 'info' && 'ℹ️'}
            </div>
            <div className="toast-text">{toast.message}</div>
            <button type="button" className="toast-close" onClick={() => setToast(null)}>
              ×
            </button>
          </m.div>
        )}
      </AnimatePresence>

      <div className="dashboard-content">
        <header className="dashboard-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <h2>Hola, {profile?.full_name || userEmail.split('@')[0]}</h2>
            <p className="user-email">{userEmail}</p>
          </div>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => loadData(true)}
            disabled={isLoading}
            title="Refrescar"
          >
            <RefreshCw className={isLoading ? 'spin' : ''} size={16} />
          </button>
        </header>

        {errorMsg && <div className="dashboard-error">{errorMsg}</div>}

        {isLoading && !profile ? (
          <div className="dashboard-loading">
            <div className="loading-spinner" />
            <p>Cargando información del panel...</p>
          </div>
        ) : (
          <>
            <div className="tab-content">
              {activeTab === 'panel' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <DashboardStats
                    profile={profile}
                    ordersCount={orders.length}
                    onNavigateToCatalog={onNavigateToCatalog}
                  />

                  {/* Bloque de Canje de Invitación Premium */}
                  <div className="invitation-redeem-container" style={{
                    background: '#ffffff',
                    border: '1px solid var(--modern-border, #E6E2DA)',
                    borderRadius: '16px',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
                    position: 'relative',
                    overflow: 'hidden',
                    textAlign: 'left'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '4px',
                      height: '100%',
                      background: 'var(--orange-base, #d4621a)'
                    }} />
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          background: 'rgba(212, 98, 26, 0.1)',
                          padding: '10px',
                          borderRadius: '12px',
                          color: 'var(--orange-base, #d4621a)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Ticket size={24} />
                        </div>
                        <div>
                          <h4 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--modern-text-primary, #1E1E1E)' }}>
                            Código de Invitación VIP
                          </h4>
                          <p style={{ fontSize: '0.8rem', color: 'var(--modern-text-secondary, #6B7280)', margin: '4px 0 0 0' }}>
                            Activa tu estatus de Invitado especial para desbloquear productos y canjear con puntos.
                          </p>
                        </div>
                      </div>

                      {profile?.isInvited && (
                        <span className="dt-badge dt-badge-success" style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700 }}>
                          ✨ Cuenta Invitada Activa
                        </span>
                      )}
                    </div>

                    {!profile?.isInvited && (
                      <form onSubmit={handleRedeemCode} style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          placeholder="Ingresa tu código VIP aquí..."
                          value={invitationCode}
                          onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                          disabled={isRedeemingCode}
                          className="vip-input-field"
                        />
                        <button
                          type="submit"
                          disabled={isRedeemingCode || !invitationCode.trim()}
                          className="btn-modal-action primary"
                          style={{
                            height: '46px',
                            padding: '0 24px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: 700,
                            boxShadow: '0 4px 12px rgba(212, 98, 26, 0.15)',
                            cursor: isRedeemingCode || !invitationCode.trim() ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {isRedeemingCode ? (
                            <>
                              <Loader2 size={16} className="spin" />
                              Verificando...
                            </>
                          ) : (
                            <>Activar Acceso</>
                          )}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}
              {activeTab === 'activities' && (
                <ActivitiesDashboard userId={userId} />
              )}
              {activeTab === 'history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <DashboardHistory
                    orders={orders}
                    onNavigateToCatalog={onNavigateToCatalog}
                    userId={userId}
                    userName={profile?.full_name || userEmail.split('@')[0]}
                    onRefresh={loadData}
                    formatCOP={formatCOP}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
