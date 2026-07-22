import { useState, useEffect, useCallback } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabaseClient';
import { invalidateCache, invalidateCacheByPrefix } from '../../lib/queryCache';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { RefreshCw } from 'lucide-react';
import './DashboardView.css';
import { userService } from '../../services/userService';

// Import subcomponents
import { DashboardStats } from './dashboard/DashboardStats';
import { DashboardHistory } from './dashboard/DashboardHistory';

// Import types
import type { Profile, Order } from './dashboard/types';

interface Props {
  userId: string;
  userEmail: string;
  onNavigateToCatalog: () => void;
  activeTab?: 'panel' | 'history';
  setActiveTab?: (tab: 'panel' | 'history') => void;
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
                </div>
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
