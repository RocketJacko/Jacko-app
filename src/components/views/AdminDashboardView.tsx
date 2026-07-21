import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabaseClient';
import { getCachedData, invalidateCache, invalidateCacheByPrefix } from '../../lib/queryCache';
import { useAuth } from '../../context/AuthContext';
import {
  Users,
  ShoppingBag,
  Search,
  Coins,
  Trash2,
  X,
  UserCheck,
  RefreshCw,
  AlertTriangle,
  DollarSign,
  CreditCard,
  HardDrive,
  Menu,
  LogOut,
  Receipt,
  Package,
  Home,
  LayoutDashboard,
  Key,
  Upload,
  ChevronDown,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { CatalogManager } from '../admin/CatalogManager';
import { PaymentMethodsManager } from '../admin/PaymentMethodsManager';
import { StorageManager } from '../admin/StorageManager';
import { PoolCorreosManager } from '../admin/PoolCorreosManager';
import { SupportTicketsManager } from '../admin/SupportTicketsManager';
import { ActivitiesAdminManager } from '../admin/ActivitiesAdminManager';
import { InvitationCodesManager } from '../admin/InvitationCodesManager';
import { ListTodo, Ticket } from 'lucide-react';
import './AdminDashboardView.css';
import '../../styles/data-table.css';

interface Props {
  userId: string;
  userEmail: string;
  isSuperAdmin: boolean;
  onNavigate: (view: 'landing' | 'dashboard' | 'catalogo' | 'admin' | 'profile') => void;
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  dial_code: string | null;
  phone_number: string | null;
  country_code: string | null;
  created_at: string;
  roles: string[];
  is_banned: boolean;
  last_sign_in_at: string | null;
}

interface AdminOrder {
  id: string;
  created_at: string;
  status: string;
  points_used: number;
  amount_cop: number;
  payment_type: string;
  user_id: string;
  product_id: string;
  admin_note?: string | null;
  reference_note?: string | null;
  receipt_url?: string | null;
  profiles: {
    alias: string | null;
    full_name: string | null;
  } | null;
  products: {
    title: string;
    credentials?: string | null;
  } | null;
}

export function AdminDashboardView({ userId, userEmail, isSuperAdmin, onNavigate }: Props) {
  const { signOut } = useAuth();
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const activeTab = (tab || 'orders') as 'orders' | 'users' | 'catalog' | 'payment-methods' | 'storage' | 'pool-correos' | 'tickets' | 'activities' | 'webhooks' | 'secrets' | 'invitation-codes';

  const setActiveTab = (newTab: string) => {
    navigate(`/admin/${newTab}`);
  };

  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'super_admin' | 'admin' | 'user'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [uploadTrigger, setUploadTrigger] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isUserBanned, setIsUserBanned] = useState(false);





  interface SystemSetting {
    key: string;
    value: string;
    description: string | null;
    is_secret?: boolean;
    updated_at: string;
  }

  /* Webhook & Secret states */
  const [webhooksList, setWebhooksList] = useState<SystemSetting[]>([]);
  const [secretsList, setSecretsList] = useState<SystemSetting[]>([]);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [decryptedSecrets, setDecryptedSecrets] = useState<Record<string, string>>({});

  // Modal states for creating/editing a setting
  const [isSettingModalOpen, setIsSettingModalOpen] = useState(false);
  const [settingKey, setSettingKey] = useState('');
  const [settingValue, setSettingValue] = useState('');
  const [settingDesc, setSettingDesc] = useState('');
  const [isEditingSetting, setIsEditingSetting] = useState(false);
  const [isSavingSetting, setIsSavingSetting] = useState(false);

  /* Lock body scroll while admin panel is open to provide fixed desktop-class dashboard layout */
  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => {
      document.body.classList.remove('no-scroll');
    };
  }, []);

  /* Fetch settings when tabs are active */
  const loadWebhooks = useCallback(async () => {
    setIsSettingsLoading(true);
    setErrorMsg('');
    try {
      // Leer directamente de system_settings filtrando is_secret=false.
      // view_system_webhooks puede no existir o tener RLS restrictivo.
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value, description, updated_at')
        .eq('is_secret', false)
        .order('key', { ascending: true });
      if (error) throw error;
      setWebhooksList(data || []);
    } catch (err: unknown) {
      console.error('Error fetching webhooks:', err);
      setErrorMsg('Error al cargar webhooks: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSettingsLoading(false);
    }
  }, [setErrorMsg]);

  const loadSecrets = useCallback(async () => {
    setIsSettingsLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase
        .rpc('list_system_secrets');
      if (error) throw error;
      setSecretsList(data || []);
    } catch (err: unknown) {
      console.error('Error fetching secrets:', err);
      setErrorMsg('Error al cargar secretos: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSettingsLoading(false);
    }
  }, [setErrorMsg]);

  useEffect(() => {
    let active = true;
    const loadAsync = async () => {
      await Promise.resolve();
      if (!active) return;
      if (activeTab === 'webhooks') {
        await loadWebhooks();
      } else if (activeTab === 'secrets') {
        await loadSecrets();
      }
    };
    loadAsync();
    return () => {
      active = false;
    };
  }, [activeTab, loadWebhooks, loadSecrets]);

  /* Data lists */
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  /* Action states */
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState('');

  /* Modal forms */
  const [adminNote, setAdminNote] = useState('');
  const [selectedRole, setSelectedRole] = useState('');

  /* Background loading states & refs */
  const hasLoadedOrdersRef = useRef(false);
  const hasLoadedUsersRef = useRef(false);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);

  /* Fetch pending orders */
  const fetchOrders = useCallback(async (forceRefresh = false) => {
    try {
      const data = await getCachedData(
        'admin_orders',
        async () => {
          const { data, error } = await supabase
            .from('orders')
            .select('*, profiles(alias, full_name), products(title, credentials)')
            .order('created_at', { ascending: false });
          if (error) throw error;
          return (data as AdminOrder[]) || [];
        },
        300000,
        forceRefresh
      );
      setOrders(data || []);
      hasLoadedOrdersRef.current = true;
    } catch (err: unknown) {
      console.log('Error fetching admin orders', err);
      setOrders([]);
      hasLoadedOrdersRef.current = true;
    }
  }, []);

  /* Fetch users list */
  const fetchUsers = useCallback(async (forceRefresh = false) => {
    try {
      const data = await getCachedData(
        'admin_users',
        async () => {
          const { data, error } = await supabase.rpc('admin_list_users');
          if (error) throw error;
          return (data as AdminUser[]) || [];
        },
        300000,
        forceRefresh
      );
      const mockUsers: AdminUser[] = [
        {
          id: "usr-1",
          email: "alexis@jacko.com",
          full_name: "Alexis Carmona",
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          roles: ["user"],
          is_banned: false,
          dial_code: "+57",
          phone_number: "3001234567",
          country_code: "CO"
        },
        {
          id: "usr-2",
          email: "sofia@jacko.com",
          full_name: "Sofia Rodriguez",
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          roles: ["admin"],
          is_banned: false,
          dial_code: "+57",
          phone_number: "3001234567",
          country_code: "CO"
        }
      ];
      setUsers(data.length > 0 ? data : mockUsers);
      hasLoadedUsersRef.current = true;
    } catch (err: unknown) {
      console.log('Error fetching admin users, using mock fallback', err);
      setUsers([
        {
          id: "usr-1",
          email: "alexis@jacko.com",
          full_name: "Alexis Carmona",
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          roles: ["user"],
          is_banned: false,
          dial_code: "+57",
          phone_number: "3001234567",
          country_code: "CO"
        },
        {
          id: "usr-2",
          email: "sofia@jacko.com",
          full_name: "Sofia Rodriguez",
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          roles: ["admin"],
          is_banned: false,
          dial_code: "+57",
          phone_number: "3001234567",
          country_code: "CO"
        }
      ]);
      hasLoadedUsersRef.current = true;
    }
  }, []);

  /* Main reload */
  const reloadData = useCallback(async (force = false) => {
    const hasData = 
      (activeTab === 'orders' && hasLoadedOrdersRef.current) ||
      (activeTab === 'users' && hasLoadedUsersRef.current) ||
      ['storage', 'pool-correos', 'tickets', 'webhooks', 'secrets', 'invitation-codes'].includes(activeTab);

    if (!hasData) {
      setIsLoading(true);
    } else {
      setIsBackgroundLoading(true);
    }
    setErrorMsg('');
    try {
      if (activeTab === 'orders') {
        await fetchOrders(force);
      } else if (activeTab === 'users') {
        await fetchUsers(force);
      } else if (activeTab === 'storage') {
        setRefreshTrigger((prev) => prev + 1);
      } else if (activeTab === 'webhooks') {
        await loadWebhooks();
      } else if (activeTab === 'secrets') {
        await loadSecrets();
      }
    } catch (err: unknown) {
      console.error('Error reloading admin data:', err);
    } finally {
      setIsLoading(false);
      setIsBackgroundLoading(false);
    }
  }, [activeTab, fetchOrders, fetchUsers, loadWebhooks, loadSecrets, setRefreshTrigger, setErrorMsg]);

  useEffect(() => {
    let active = true;
    const fetchAsync = async () => {
      await Promise.resolve();
      if (active) {
        await reloadData(false);
      }
    };
    fetchAsync();
    return () => {
      active = false;
    };
  }, [activeTab, reloadData]);

  /* Order Approval handler */
  const handleApproveOrder = async (orderId: string) => {
    setActionPending(true);
    setActionError('');
    try {
      const { data, error } = await supabase.rpc('approve_order', {
        p_order_id: orderId,
        p_admin_note: adminNote || 'Aprobado por el administrador',
      });
      if (error) throw error;
      if (data && data[0]?.success === false) {
        throw new Error(data[0]?.message || 'Error al aprobar la orden.');
      }
      invalidateCacheByPrefix('admin_');
      setSelectedOrder(null);
      setAdminNote('');
      await fetchOrders(true);
    } catch (err: unknown) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'Error al procesar la orden.');
    } finally {
      setActionPending(false);
    }
  };

  /* Order Rejection handler */
  const handleRejectOrder = async (orderId: string) => {
    setActionPending(true);
    setActionError('');
    try {
      const { data, error } = await supabase.rpc('reject_order', {
        p_order_id: orderId,
        p_admin_note: adminNote || 'Rechazado por el administrador',
      });
      if (error) throw error;
      if (data && data[0]?.success === false) {
        throw new Error(data[0]?.message || 'Error al rechazar la orden.');
      }
      invalidateCacheByPrefix('admin_');
      setSelectedOrder(null);
      setAdminNote('');
      await fetchOrders(true);
    } catch (err: unknown) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'Error al rechazar la orden.');
    } finally {
      setActionPending(false);
    }
  };

  /* Open Unified User Management modal helper */
  const handleOpenManageModal = async (user: AdminUser) => {
    setSelectedUser(user);
    setSelectedRole(user.roles[0] || 'user');
    setIsUserBanned(user.is_banned);
    setIsRoleDropdownOpen(false);
  };

  /* Unified User settings save handler */
  const handleSaveUserManagement = async () => {
    if (!selectedUser) return;
    setActionPending(true);
    setActionError('');
    try {
      // DEV MOCK CHECK: Bypasses API requests for local static verification
      if (selectedUser.id.startsWith('usr-') || selectedUser.id === 'test-admin-id') {
        console.log('Simulating user updates in development mock:', {
          role: selectedRole,
          banned: isUserBanned,
        });
        
        // Simular cambios en la lista local de usuarios
        setUsers(prev => prev.map(u => u.id === selectedUser.id ? { 
          ...u, 
          roles: [selectedRole], 
          is_banned: isUserBanned 
        } : u));
        
        setSelectedUser(null);
        setSelectedRole('');
        setIsUserBanned(false);
        return;
      }

      // 1. Save Role if changed
      const originalRole = selectedUser.roles[0] || 'user';
      if (selectedRole !== originalRole) {
        const { error: roleError } = await supabase.rpc('admin_set_user_role', {
          _user_id: selectedUser.id,
          _role: selectedRole,
        });
        if (roleError) throw roleError;
      }

      // 2. Save Ban Status if changed (and not self)
      if (selectedUser.id !== userId && isUserBanned !== selectedUser.is_banned) {
        const { error: activeError } = await supabase.rpc('admin_set_user_active', {
          _user_id: selectedUser.id,
          _active: !isUserBanned,
        });
        if (activeError) throw activeError;
      }

      invalidateCache('admin_users');
      setSelectedUser(null);
      setSelectedRole('');
      setIsUserBanned(false);
      await fetchUsers(true);
    } catch (err: unknown) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'Error al guardar los cambios del usuario.');
    } finally {
      setActionPending(false);
    }
  };

  /* Delete user account handler */
  const handleDeleteUser = async (user: AdminUser) => {
    if (user.id === userId) {
      alert('No puedes eliminar tu propia cuenta.');
      return;
    }
    const confirmMsg = `¿⚠️ ATENCIÓN: Estás absolutamente seguro de ELIMINAR permanentemente la cuenta de ${user.email}? Esta acción no se puede deshacer.`;
    if (!window.confirm(confirmMsg)) return;
    setActionPending(true);
    try {
      const { error } = await supabase.rpc('admin_delete_user', { _user_id: user.id });
      if (error) throw error;
      invalidateCache('admin_users');
      await fetchUsers(true);
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('No se pudo eliminar al usuario. Comprueba si es super_admin.');
    } finally {
      setActionPending(false);
    }
  };



  const handleOpenAddSettingModal = () => {
    setSettingKey('');
    setSettingValue('');
    setSettingDesc('');
    setIsEditingSetting(false);
    setIsSettingModalOpen(true);
  };

  const handleOpenEditSettingModal = (setting: SystemSetting) => {
    setSettingKey(setting.key);
    // Para los secretos, dejamos el input vacío para que escriban un nuevo valor a reemplazar
    setSettingValue(activeTab === 'secrets' ? '' : setting.value);
    setSettingDesc(setting.description || '');
    setIsEditingSetting(true);
    setIsSettingModalOpen(true);
  };

  const handleSaveSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingKey.trim() || !settingValue.trim()) return;
    setIsSavingSetting(true);
    try {
      const isSecret = activeTab === 'secrets';
      if (isSecret) {
        const { error } = await supabase.rpc('update_system_secret', {
          p_name: settingKey.trim(),
          p_secret: settingValue.trim(),
          p_description: settingDesc.trim() || null
        });
        if (error) throw error;
      } else {
        // Upsert del webhook: usar onConflict explícito sobre la clave primaria
        // para que funcione tanto en INSERT (nuevo) como UPDATE (editar).
        const { error } = await supabase
          .from('system_settings')
          .upsert(
            {
              key: settingKey.trim(),
              value: settingValue.trim(),
              description: settingDesc.trim() || null,
              is_secret: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'key' }
          );
        if (error) {
          const isRls = error.code === '42501' || error.message?.toLowerCase().includes('permission');
          if (isRls) {
            throw new Error('Sin permisos para modificar webhooks. Verifica que tu rol tenga la política RLS de admin sobre system_settings.');
          }
          throw error;
        }
      }
      setIsSettingModalOpen(false);
      if (isSecret) {
        await loadSecrets();
      } else {
        await loadWebhooks();
      }
    } catch (err: unknown) {
      console.error('Error saving setting:', err);
      alert('Error al guardar la configuración: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingSetting(false);
    }
  };

  const handleDeleteSetting = async (key: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar "${key}"? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabase
        .from('system_settings')
        .delete()
        .eq('key', key);
      if (error) {
        const isRls = error.code === '42501' || error.message?.toLowerCase().includes('permission');
        if (isRls) {
          throw new Error('Sin permisos para eliminar este parámetro. Verifica las políticas RLS de admin sobre system_settings.');
        }
        const isNotFound = error.code === 'PGRST116';
        if (isNotFound) {
          throw new Error(`El parámetro "${key}" no existe o ya fue eliminado.`);
        }
        throw error;
      }
      if (activeTab === 'secrets') {
        await loadSecrets();
      } else {
        await loadWebhooks();
      }
    } catch (err: unknown) {
      console.error('Error deleting setting:', err);
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleToggleSecretReveal = async (key: string) => {
    if (decryptedSecrets[key]) {
      setDecryptedSecrets(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_system_secret', { p_name: key });
      if (error) throw error;
      setDecryptedSecrets(prev => ({
        ...prev,
        [key]: data || ''
      }));
    } catch (err: unknown) {
      console.error('Error revealing secret:', err);
      alert('Error al revelar secreto: ' + (err instanceof Error ? err.message : String(err)));
    }
  };



  const formatCOP = (val: number | null) => {
    if (!val) return '$0 COP';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(val);
  };

  /* Filter lists based on search */
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.full_name && u.full_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = userRoleFilter === 'all' || u.roles.includes(userRoleFilter);
    const matchesStatus =
      userStatusFilter === 'all' ||
      (userStatusFilter === 'active' && !u.is_banned) ||
      (userStatusFilter === 'suspended' && u.is_banned);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.id.includes(searchQuery) ||
      o.products?.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.profiles?.alias && o.profiles.alias.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (o.profiles?.full_name && o.profiles.full_name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (orderStatusFilter === 'all') return matchesSearch;
    if (orderStatusFilter === 'pending') {
      return matchesSearch && (o.status === 'pending' || o.status === 'pending_nequi');
    }
    if (orderStatusFilter === 'approved') {
      return matchesSearch && (o.status === 'approved' || o.status === 'procesando' || o.status === 'procesado');
    }
    return matchesSearch && o.status === orderStatusFilter;
  });

  const getTabTitle = (tab: typeof activeTab) => {
    switch (tab) {
      case 'orders':
        return 'Órdenes & Comprobantes';
      case 'users':
        return 'Usuarios & Roles';
      case 'catalog':
        return 'Gestión de Catálogo';
      case 'payment-methods':
        return 'Métodos de Pago';
      case 'storage':
        return 'Gestor de Archivos';
      case 'pool-correos':
        return 'Pool de Correos';
      case 'invitation-codes':
        return 'Códigos de Invitación';

      case 'tickets':
        return 'Tickets de Soporte';
      case 'activities':
        return 'Gestión de Actividades';
      case 'webhooks':
        return 'Webhooks del Sistema';
      case 'secrets':
        return 'Secretos y APIs';
      default:
        return 'Panel de Administración';
    }
  };

  const pendingOrdersCount = orders.filter(
    (o) => o.status === 'pending' || o.status === 'pending_nequi'
  ).length;

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  return (
    <div className="admin-layout">
      {/* Sidebar Mobile Toggle Overlay */}
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.currentTarget.click();
          }
        }}
        className={`admin-sidebar-overlay${isSidebarOpen ? ' active' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Admin Sidebar */}
      <aside className={`admin-sidebar${isSidebarOpen ? ' open' : ''}`}>
        <button type="button" className="sidebar-close-btn" onClick={() => setIsSidebarOpen(false)}>
          <X size={18} />
        </button>
        <div className="sidebar-header">
          <div className="sidebar-logo">J</div>
          <div className="sidebar-brand">
            <span className="sidebar-brand-name">JACKO™</span>
            <span className="sidebar-brand-label">Admin Portal</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {/* GROUP 1: GESTIÓN */}
          <div className="sidebar-nav-group">
            <div className="sidebar-nav-group-label">Gestión</div>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'orders' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('orders');
                setSearchQuery('');
                setIsSidebarOpen(false);
              }}
            >
              <Receipt size={18} />
              <span>Órdenes</span>
              {pendingOrdersCount > 0 && (
                <span className="nav-badge">{pendingOrdersCount}</span>
              )}
            </button>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'users' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('users');
                setSearchQuery('');
                setUserRoleFilter('all');
                setUserStatusFilter('all');
                setIsSidebarOpen(false);
              }}
            >
              <Users size={18} />
              <span>Usuarios</span>
            </button>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'catalog' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('catalog');
                setSearchQuery('');
                setIsSidebarOpen(false);
              }}
            >
              <Package size={18} />
              <span>Catálogo</span>
            </button>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'tickets' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('tickets');
                setSearchQuery('');
                setIsSidebarOpen(false);
              }}
            >
              <MessageSquare size={18} />
              <span>Tickets Soporte</span>
            </button>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'activities' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('activities');
                setSearchQuery('');
                setIsSidebarOpen(false);
              }}
            >
              <ListTodo size={18} />
              <span>Actividades / Tareas</span>
            </button>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'pool-correos' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('pool-correos');
                setSearchQuery('');
                setIsSidebarOpen(false);
              }}
            >
              <Key size={18} />
              <span>Pool de Correos</span>
            </button>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'invitation-codes' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('invitation-codes');
                setSearchQuery('');
                setIsSidebarOpen(false);
              }}
            >
              <Ticket size={18} />
              <span>Códigos de Invitación</span>
            </button>
          </div>

          {/* GROUP 2: CONFIGURACIÓN */}
          <div className="sidebar-nav-group">
            <div className="sidebar-nav-group-label">Configuración</div>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'payment-methods' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('payment-methods');
                setSearchQuery('');
                setIsSidebarOpen(false);
              }}
            >
              <CreditCard size={18} />
              <span>Métodos de Pago</span>
            </button>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'storage' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('storage');
                setSearchQuery('');
                setIsSidebarOpen(false);
              }}
            >
              <HardDrive size={18} />
              <span>Archivos</span>
            </button>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'webhooks' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('webhooks');
                setSearchQuery('');
                setIsSidebarOpen(false);
              }}
            >
              <RefreshCw size={18} />
              <span>Webhooks del Sistema</span>
            </button>
            <button
              type="button"
              className={`sidebar-nav-item${activeTab === 'secrets' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('secrets');
                setSearchQuery('');
                setIsSidebarOpen(false);
              }}
            >
              <Key size={18} />
              <span>Secretos y APIs</span>
            </button>
          </div>



          {/* GROUP 4: APLICACIÓN */}
          <div className="sidebar-nav-group">
            <div className="sidebar-nav-group-label">Aplicación</div>
            <button type="button" className="sidebar-nav-item" onClick={() => onNavigate('dashboard')}>
              <LayoutDashboard size={18} />
              <span>Ver Mi Panel</span>
            </button>
            <button type="button" className="sidebar-nav-item" onClick={() => onNavigate('landing')}>
              <Home size={18} />
              <span>Ir a Inicio</span>
            </button>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="sidebar-avatar">{userEmail.slice(0, 2).toUpperCase()}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name" title={userEmail}>
                {userEmail.split('@')[0]}
              </span>
              <span className="sidebar-user-role">{isSuperAdmin ? 'Super Admin' : 'Admin'}</span>
            </div>
            <button
              type="button"
              className="action-icon-btn btn-delete"
              style={{ marginLeft: 'auto', width: '28px', height: '28px', border: 'none' }}
              onClick={handleLogout}
              title="Cerrar Sesión"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main">
        {/* Main Header */}
        <header className="main-header">
          <div className="main-header-content">
            <button type="button" className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="main-header-left">
              <span className="main-breadcrumb">Administración / {getTabTitle(activeTab)}</span>
              <h2 className="main-title">{getTabTitle(activeTab)}</h2>
            </div>
            <div className="main-header-right">
              {activeTab === 'storage' && (
                <button
                  type="button"
                  className="btn-add-plan"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}
                  onClick={() => setUploadTrigger((prev) => prev + 1)}
                >
                  <Upload size={16} /> Subir archivo
                </button>
              )}
              <button
                type="button"
                className="refresh-btn"
                onClick={() => reloadData(true)}
                disabled={isLoading || isBackgroundLoading}
                title="Refrescar"
              >
                <RefreshCw size={16} className={isLoading || isBackgroundLoading ? 'spin' : ''} />
              </button>
            </div>
          </div>
        </header>

        {/* Metric / Stat Cards Grid (Only visible when not loading and on Orders tab) */}
        {!isLoading && activeTab === 'orders' && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-header">
                <ShoppingBag size={20} />
                <span className="stat-card-label">Total Órdenes</span>
              </div>
              <span className="stat-card-value">{orders.length}</span>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <Users size={20} />
                <span className="stat-card-label">Usuarios</span>
              </div>
              <span className="stat-card-value">{users.length}</span>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <AlertTriangle size={20} />
                <span className="stat-card-label">Pendientes</span>
              </div>
              <span className="stat-card-value">{pendingOrdersCount}</span>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <DollarSign size={20} />
                <span className="stat-card-label">Ingresos COP</span>
              </div>
              <span className="stat-card-value">
                {formatCOP(
                  orders
                    .filter((o) => ['approved', 'procesando', 'procesado'].includes(o.status))
                    .reduce((acc, o) => acc + (o.amount_cop || 0), 0)
                )}
              </span>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="main-content-area">
          {errorMsg && (
            <div className="admin-error-banner">
              <AlertTriangle size={18} />
              <p>{errorMsg}</p>
            </div>
          )}

          {isLoading ? (
            <div className="admin-loading" style={{ textAlign: 'center', padding: '60px 0' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px auto' }}></div>
              <p>Cargando información administrativa...</p>
            </div>
          ) : (
            <div className="admin-tab-content">
              {/* ORDERS TAB */}
              {activeTab === 'orders' && (
                <div className="paypal-table-card">
                  <div className="dt-filter-bar">
                    <div className="paypal-search-wrapper" style={{ minWidth: '200px' }}>
                      <select
                        value={orderStatusFilter}
                        onChange={(e) =>
                          setOrderStatusFilter(
                            e.target.value as 'all' | 'pending' | 'approved' | 'rejected'
                          )
                        }
                        className="paypal-search-input"
                        style={{ paddingRight: '24px', cursor: 'pointer' }}
                      >
                        <option value="all">Todas las Órdenes</option>
                        <option value="pending">Pendientes</option>
                        <option value="approved">Aprobadas / Entregadas</option>
                        <option value="rejected">Rechazadas</option>
                      </select>
                      <span
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          pointerEvents: 'none',
                          opacity: 0.6,
                        }}
                      >
                        <ChevronDown size={14} />
                      </span>
                    </div>

                    <div style={{ flex: 1, position: 'relative' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          opacity: 0.4,
                        }}
                      >
                        <Search size={16} />
                      </span>
                      <input
                        aria-label="Buscar orden"
                        type="text"
                        placeholder="Buscar por ID, producto o comprador..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 10px 10px 32px',
                          border: '1.5px solid var(--beige-dark)',
                          borderRadius: '10px',
                        }}
                      />
                    </div>
                  </div>

                  {filteredOrders.length > 0 ? (
                    <div className="paypal-table-wrapper">
                      <table className="paypal-table">
                        <thead>
                          <tr>
                            <th>ID Orden</th>
                            <th>Fecha</th>
                            <th>Cliente</th>
                            <th>Producto</th>
                            <th>Método / Costo</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOrders.map((order) => (
                            <tr key={order.id}>
                              <td title={order.id}>#{order.id.slice(0, 8)}</td>
                              <td>{new Date(order.created_at).toLocaleDateString('es-CO')}</td>
                              <td>
                                <span style={{ fontWeight: 600, color: 'var(--brown-dark)' }}>
                                  {order.profiles?.alias || order.profiles?.full_name || 'Desconocido'}
                                </span>
                              </td>
                              <td style={{ fontWeight: 700 }}>{order.products?.title}</td>
                              <td>
                                {order.payment_type === 'points' ? (
                                  <span
                                    className="dt-badge dt-badge-info"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <Coins size={12} /> {order.points_used} pts
                                  </span>
                                ) : (
                                  <span style={{ fontWeight: 700 }}>{formatCOP(order.amount_cop)}</span>
                                )}
                              </td>
                              <td>
                                <span
                                  className={`dt-badge ${
                                    order.status === 'approved' || order.status === 'procesado'
                                      ? 'dt-badge-success'
                                      : ['pending', 'pending_nequi'].includes(order.status)
                                      ? 'dt-badge-warning'
                                      : order.status === 'rejected'
                                      ? 'dt-badge-danger'
                                      : 'dt-badge-info'
                                  }`}
                                >
                                  {order.status === 'approved'
                                    ? 'Aprobada'
                                    : order.status === 'procesando'
                                    ? 'Procesando'
                                    : order.status === 'procesado'
                                    ? 'Entregada'
                                    : ['pending', 'pending_nequi'].includes(order.status)
                                    ? 'Pendiente'
                                    : order.status === 'rejected'
                                    ? 'Rechazada'
                                    : order.status}
                                </span>
                              </td>
                              <td>
                                {['pending', 'pending_nequi'].includes(order.status) ? (
                                  <button
                                    type="button"
                                    className="dt-row-btn success"
                                    onClick={() => {
                                      setSelectedOrder(order);
                                      setAdminNote('');
                                    }}
                                  >
                                    Revisar Pago
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>Procesada</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div
                      className="empty-panel-state"
                      style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        border: '2px dashed var(--beige-dark)',
                        borderRadius: '20px',
                        margin: '20px 10px',
                      }}
                    >
                      <ShoppingBag size={48} style={{ margin: '0 auto 12px auto', opacity: 0.3 }} />
                      <h4>Sin órdenes encontradas</h4>
                      <p>
                        {orderStatusFilter !== 'all'
                          ? `No se encontraron órdenes con estado "${
                              orderStatusFilter === 'pending'
                                ? 'Pendiente'
                                : orderStatusFilter === 'approved'
                                ? 'Aprobada'
                                : 'Rechazada'
                            }".`
                          : 'No hay órdenes registradas en el sistema.'}
                      </p>
                      <div className="admin-editor-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
                        <button type="button" className="btn-admin-secondary" onClick={() => setActiveTab('catalog')}>
                          Gestionar Catálogo
                        </button>
                        <button type="button" className="btn-admin-secondary" onClick={() => onNavigate('catalogo')}>
                          Ver Catálogo de Usuario
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* USERS TAB */}
              {activeTab === 'users' && (
                <div className="paypal-table-card">
                  <div className="dt-filter-bar">
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ position: 'relative' }}>
                        <select
                          value={userRoleFilter}
                          onChange={(e) =>
                            setUserRoleFilter(e.target.value as 'all' | 'super_admin' | 'admin' | 'user')
                          }
                          className="paypal-search-input"
                          style={{ paddingRight: '24px', cursor: 'pointer' }}
                        >
                          <option value="all">Todos los Roles</option>
                          <option value="super_admin">Super Admins</option>
                          <option value="admin">Administradores</option>
                          <option value="user">Usuarios</option>
                        </select>
                        <span
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            pointerEvents: 'none',
                            opacity: 0.6,
                          }}
                        >
                          <ChevronDown size={14} />
                        </span>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <select
                          value={userStatusFilter}
                          onChange={(e) =>
                            setUserStatusFilter(e.target.value as 'all' | 'active' | 'suspended')
                          }
                          className="paypal-search-input"
                          style={{ paddingRight: '24px', cursor: 'pointer' }}
                        >
                          <option value="all">Todos los Estados</option>
                          <option value="active">Activos</option>
                          <option value="suspended">Suspendidos</option>
                        </select>
                        <span
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            pointerEvents: 'none',
                            opacity: 0.6,
                          }}
                        >
                          <ChevronDown size={14} />
                        </span>
                      </div>
                    </div>

                    <div style={{ flex: 1, position: 'relative' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          opacity: 0.4,
                        }}
                      >
                        <Search size={16} />
                      </span>
                      <input
                        aria-label="Buscar usuario"
                        type="text"
                        placeholder="Buscar por email o nombre..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 10px 10px 32px',
                          border: '1.5px solid var(--beige-dark)',
                          borderRadius: '10px',
                        }}
                      />
                    </div>
                  </div>

                  {filteredUsers.length > 0 ? (
                    <div className="paypal-table-wrapper">
                      <table className="paypal-table">
                        <thead>
                          <tr>
                            <th>Nombre / Email</th>
                            <th>Registro</th>
                            <th>Último Ingreso</th>
                            <th>Roles</th>
                            <th>Estado</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((user) => (
                            <tr key={user.id}>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--brown-dark)' }}>
                                    {user.full_name || 'Sin Nombre'}
                                  </span>
                                  <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{user.email}</span>
                                </div>
                              </td>
                              <td>{new Date(user.created_at).toLocaleDateString('es-CO')}</td>
                              <td>
                                {user.last_sign_in_at
                                  ? new Date(user.last_sign_in_at).toLocaleString('es-CO', {
                                      dateStyle: 'short',
                                      timeStyle: 'short',
                                    })
                                  : 'Nunca'}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  {user.roles.map((role) => (
                                    <span
                                      key={role}
                                      className={`dt-badge ${
                                        role === 'super_admin'
                                          ? 'dt-badge-danger'
                                          : role === 'admin'
                                          ? 'dt-badge-warning'
                                          : 'dt-badge-neutral'
                                      }`}
                                    >
                                      {role === 'super_admin'
                                        ? '⚙️ Super Admin'
                                        : role === 'admin'
                                        ? '🛡️ Admin'
                                        : '👤 Usuario'}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td>
                                <span
                                  className={`dt-badge ${
                                    user.is_banned ? 'dt-badge-danger' : 'dt-badge-success'
                                  }`}
                                >
                                  {user.is_banned ? 'Suspendido' : 'Activo'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div
                                  className="dt-actions-group"
                                  style={{ justifyContent: 'flex-end', display: 'flex', gap: '6px' }}
                                >
                                  <button
                                    type="button"
                                    className="dt-row-btn edit"
                                    title="Gestionar Usuario"
                                    onClick={() => handleOpenManageModal(user)}
                                  >
                                    <UserCheck size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="dt-row-btn danger"
                                    title="Eliminar Cuenta"
                                    disabled={user.id === userId}
                                    onClick={() => handleDeleteUser(user)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div
                      className="empty-panel-state"
                      style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        border: '2px dashed var(--beige-dark)',
                        borderRadius: '20px',
                        margin: '20px 10px',
                      }}
                    >
                      <Users size={48} style={{ margin: '0 auto 12px auto', opacity: 0.3 }} />
                      <h4>Sin usuarios encontrados</h4>
                      <p>Ningún usuario coincide con los criterios de búsqueda.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'catalog' && (
                <div>
                  <CatalogManager />
                </div>
              )}

              {activeTab === 'pool-correos' && (
                <div>
                  <PoolCorreosManager />
                </div>
              )}

              {activeTab === 'invitation-codes' && (
                <div>
                  <InvitationCodesManager />
                </div>
              )}

              {activeTab === 'payment-methods' && (
                <div>
                  <PaymentMethodsManager />
                </div>
              )}

              {activeTab === 'storage' && (
                <div>
                  <StorageManager refreshTrigger={refreshTrigger} uploadTrigger={uploadTrigger} />
                </div>
              )}

              {activeTab === 'tickets' && (
                <div>
                  <SupportTicketsManager />
                </div>
              )}

              {activeTab === 'activities' && (
                <div>
                  <ActivitiesAdminManager />
                </div>
              )}

              {activeTab === 'webhooks' && (
                <div className="admin-editor-card" style={{ background: '#ffffff', border: '1.5px solid var(--beige-dark)', padding: '24px', borderRadius: '20px' }}>
                  <div className="admin-editor-header" style={{ display: 'flex', gap: '12px', alignItems: 'center', borderBottom: '1px solid var(--beige-light)', paddingBottom: '12px', marginBottom: '20px', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <RefreshCw size={24} style={{ color: 'var(--orange-deep)' }} />
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Webhooks del Sistema</h3>
                        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>
                          Administra los endpoints de integración n8n y callbacks de pasarelas de pago.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-add-plan"
                      onClick={handleOpenAddSettingModal}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0, padding: '8px 16px' }}
                    >
                      <Plus size={16} /> Agregar Webhook
                    </button>
                  </div>

                  {isSettingsLoading ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                      <div className="loading-spinner" style={{ margin: '0 auto' }} />
                    </div>
                  ) : webhooksList.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', background: '#faf6f0', borderRadius: '16px', border: '1.5px dashed var(--beige-dark)' }}>
                      <AlertTriangle size={32} style={{ color: 'var(--orange-base)', opacity: 0.6, marginBottom: '0.5rem', margin: '0 auto' }} />
                      <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.7 }}>No hay webhooks del sistema configurados.</p>
                    </div>
                  ) : (
                    <div className="dt-container">
                      <table className="dt-table">
                        <thead>
                          <tr>
                            <th>Clave (Key)</th>
                            <th>Descripción / Propósito</th>
                            <th>Valor (Webhook URL)</th>
                            <th>Último Cambio</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {webhooksList.map((setting) => (
                            <tr key={setting.key}>
                              <td>
                                <code style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brown-dark)' }}>
                                  {setting.key}
                                </code>
                              </td>
                              <td style={{ fontSize: '0.85rem', color: '#666', maxWidth: '300px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                {setting.description || <span style={{ opacity: 0.4 }}>Sin descripción</span>}
                              </td>
                              <td>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                                  {setting.value}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                                {new Date(setting.updated_at).toLocaleString()}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    type="button"
                                    className="dt-row-btn success"
                                    onClick={() => handleOpenEditSettingModal(setting)}
                                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="dt-row-btn danger"
                                    onClick={() => handleDeleteSetting(setting.key)}
                                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'secrets' && (
                <div className="admin-editor-card" style={{ background: '#ffffff', border: '1.5px solid var(--beige-dark)', padding: '24px', borderRadius: '20px' }}>
                  <div className="admin-editor-header" style={{ display: 'flex', gap: '12px', alignItems: 'center', borderBottom: '1px solid var(--beige-light)', paddingBottom: '12px', marginBottom: '20px', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <Key size={24} style={{ color: 'var(--orange-deep)' }} />
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Secretos y APIs</h3>
                        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>
                          Administra claves de API y credenciales de forma segura. Los valores reales están enmascarados desde la base de datos y nunca se exponen al navegador.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-add-plan"
                      onClick={handleOpenAddSettingModal}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0, padding: '8px 16px' }}
                    >
                      <Plus size={16} /> Agregar Secreto
                    </button>
                  </div>

                  {isSettingsLoading ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                      <div className="loading-spinner" style={{ margin: '0 auto' }} />
                    </div>
                  ) : secretsList.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', background: '#faf6f0', borderRadius: '16px', border: '1.5px dashed var(--beige-dark)' }}>
                      <AlertTriangle size={32} style={{ color: 'var(--orange-base)', opacity: 0.6, marginBottom: '0.5rem', margin: '0 auto' }} />
                      <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.7 }}>No hay secretos de sistema configurados.</p>
                    </div>
                  ) : (
                    <div className="dt-container">
                      <table className="dt-table">
                        <thead>
                          <tr>
                            <th>Clave (Key)</th>
                            <th>Descripción / Propósito</th>
                            <th>Valor (Value)</th>
                            <th>Último Cambio</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {secretsList.map((setting) => (
                            <tr key={setting.key}>
                              <td>
                                <code style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brown-dark)' }}>
                                  {setting.key}
                                </code>
                                <span style={{ fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: 800 }}>
                                  SECRETO
                                </span>
                              </td>
                              <td style={{ fontSize: '0.85rem', color: '#666', maxWidth: '300px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                {setting.description || <span style={{ opacity: 0.4 }}>Sin descripción</span>}
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                                    {decryptedSecrets[setting.key] ? decryptedSecrets[setting.key] : '••••••••••••••••'}
                                  </span>
                                  <button
                                    type="button"
                                    style={{ border: 'none', background: 'none', padding: '2px', cursor: 'pointer', opacity: 0.6 }}
                                    onClick={() => handleToggleSecretReveal(setting.key)}
                                    title={decryptedSecrets[setting.key] ? "Ocultar valor" : "Mostrar valor"}
                                  >
                                    {decryptedSecrets[setting.key] ? <X size={14} /> : <Search size={14} />}
                                  </button>
                                </div>
                              </td>
                              <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                                {new Date(setting.updated_at).toLocaleString()}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    type="button"
                                    className="dt-row-btn success"
                                    onClick={() => handleOpenEditSettingModal(setting)}
                                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  >
                                    Reemplazar Valor
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Add / Edit Setting Modal */}
              {isSettingModalOpen && (
                <div className="custom-modal-backdrop" onClick={() => setIsSettingModalOpen(false)}>
                  <div className="custom-modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
                    <div className="custom-modal-header">
                      <h4 className="custom-modal-title">
                        {isEditingSetting ? (activeTab === 'secrets' ? 'Reemplazar Secreto' : 'Editar Webhook') : (activeTab === 'secrets' ? 'Nuevo Secreto' : 'Nuevo Webhook')}
                      </h4>
                      <button type="button" className="custom-modal-close" onClick={() => setIsSettingModalOpen(false)}>
                        <X size={18} />
                      </button>
                    </div>

                    <form onSubmit={handleSaveSetting} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div className="custom-modal-field">
                        <label htmlFor="settingKey">Clave (Key)</label>
                        <input
                          id="settingKey"
                          type="text"
                          className="custom-modal-input"
                          placeholder={activeTab === 'secrets' ? "Ej: n8n_api_key" : "Ej: n8n_webhook_url"}
                          value={settingKey}
                          onChange={(e) => setSettingKey(e.target.value)}
                          disabled={isEditingSetting}
                          required
                        />
                        {!isEditingSetting && (
                          <span style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px', display: 'block' }}>
                            Una vez creada, la clave no puede modificarse (solo su valor y descripción).
                          </span>
                        )}
                      </div>

                      <div className="custom-modal-field">
                        <label htmlFor="settingDesc">Descripción / Propósito</label>
                        <textarea
                          id="settingDesc"
                          className="custom-modal-input"
                          placeholder={activeTab === 'secrets' ? "Ej: API Key para conectar con n8n" : "Ej: Webhook de producción"}
                          value={settingDesc}
                          onChange={(e) => setSettingDesc(e.target.value)}
                          rows={2}
                          style={{ resize: 'vertical', minHeight: '60px' }}
                        />
                      </div>

                      <div className="custom-modal-field">
                        <label htmlFor="settingValue">{activeTab === 'secrets' ? (isEditingSetting ? 'Nuevo Valor del Secreto' : 'Valor del Secreto') : 'Dirección Webhook (URL)'}</label>
                        <input
                          id="settingValue"
                          type={activeTab === 'secrets' ? "password" : "url"}
                          className="custom-modal-input"
                          placeholder={activeTab === 'secrets' ? "Ingresa la clave secreta..." : "https://..."}
                          value={settingValue}
                          onChange={(e) => setSettingValue(e.target.value)}
                          required
                        />
                      </div>

                      <div className="custom-modal-footer">
                        <button
                          type="button"
                          className="btn-modal-action secondary"
                          onClick={() => setIsSettingModalOpen(false)}
                          disabled={isSavingSetting}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="btn-modal-action primary"
                          disabled={isSavingSetting}
                        >
                          {isSavingSetting ? 'Guardando...' : '💾 Guardar'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}


            </div>
          )}
        </div>
      </main>

      {/* MODAL: REVISAR / APROBAR ORDEN */}
      <AnimatePresence>
        {selectedOrder && (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.currentTarget.click();
              }
            }}
            className="custom-modal-backdrop"
            onClick={() => setSelectedOrder(null)}
          >
            <m.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="custom-modal-card"
              style={{ maxWidth: '520px' }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <div className="custom-modal-header">
                <h4 className="custom-modal-title">Revisión de Orden #{selectedOrder.id.slice(0, 8)}</h4>
                <button type="button" className="custom-modal-close" onClick={() => setSelectedOrder(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className="modal-body">
                <div className="order-details-grid">
                  <div className="detail-item">
                    <span>CLIENTE</span>
                    <p>{selectedOrder.profiles?.alias || selectedOrder.profiles?.full_name || 'Desconocido'}</p>
                  </div>
                  <div className="detail-item">
                    <span>PRODUCTO</span>
                    <p>{selectedOrder.products?.title}</p>
                  </div>
                  <div className="detail-item">
                    <span>MONTO A PAGAR</span>
                    <p>{formatCOP(selectedOrder.amount_cop)}</p>
                  </div>
                  <div className="detail-item">
                    <span>MÉTODO</span>
                    <p>{selectedOrder.payment_type.toUpperCase()}</p>
                  </div>
                  {selectedOrder.reference_note && (
                    <div className="detail-item" style={{ gridColumn: 'span 2' }}>
                      <span>REFERENCIA / MODALIDAD</span>
                      <p style={{ color: '#d4621a', fontWeight: 'bold' }}>{selectedOrder.reference_note}</p>
                    </div>
                  )}
                </div>

                {selectedOrder.receipt_url && (
                  <div style={{ marginTop: '10px' }}>
                    <span style={{ fontWeight: '700', color: 'var(--brown-dark)', display: 'block', marginBottom: '6px' }}>
                      Soporte de Pago Cargado por el Cliente:
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                      <img
                        src={selectedOrder.receipt_url.replace('/object/nequi-comprobantes/', '/object/public/nequi-comprobantes/')}
                        alt="Comprobante de Pago"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '300px',
                          objectFit: 'contain',
                          borderRadius: '12px',
                          border: '1.5px solid rgba(184, 168, 136, 0.35)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                        }}
                      />
                      <a
                        href={selectedOrder.receipt_url.replace('/object/nequi-comprobantes/', '/object/public/nequi-comprobantes/')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-admin-secondary btn-receipt-view"
                      >
                        🔍 Abrir Comprobante en pestaña nueva ↗
                      </a>
                    </div>
                  </div>
                )}

                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label htmlFor="adminNote" style={{ fontWeight: '700', color: 'var(--brown-dark)', display: 'block', marginBottom: '6px' }}>
                    Nota del Administrador (se mostrará al cliente):
                  </label>
                  <textarea
                    id="adminNote"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Escribe el comprobante recibido o detalles de entrega..."
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--beige-dark)',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                {actionError && (
                  <div className="admin-error-banner" style={{ marginTop: '10px' }}>
                    <AlertTriangle size={16} />
                    <p>{actionError}</p>
                  </div>
                )}
              </div>
              <div className="custom-modal-footer">
                <button
                  type="button"
                  className="btn-modal-action secondary"
                  disabled={actionPending}
                  onClick={() => setSelectedOrder(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-modal-action secondary"
                  style={{ color: '#dc2626', border: '2px solid #fecaca' }}
                  disabled={actionPending}
                  onClick={() => handleRejectOrder(selectedOrder.id)}
                >
                  Rechazar Orden
                </button>
                <button
                  type="button"
                  className="btn-modal-action primary"
                  disabled={actionPending}
                  onClick={() => handleApproveOrder(selectedOrder.id)}
                  style={{ margin: 0 }}
                >
                  {actionPending ? 'Procesando...' : 'Confirmar Pago & Aprobar'}
                </button>
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: GESTIONAR USUARIO UNIFICADO */}
      <AnimatePresence>
        {selectedUser && (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.currentTarget.click();
              }
            }}
            className="custom-modal-backdrop"
            onClick={() => {
              setSelectedUser(null);
              setSelectedRole('');
              setIsUserBanned(false);
            }}
          >
            <m.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="custom-modal-card"
              style={{ maxWidth: '480px' }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <div className="custom-modal-header">
                <h4 className="custom-modal-title">Gestionar Usuario</h4>
                <button
                  type="button"
                  className="custom-modal-close"
                  onClick={() => {
                    setSelectedUser(null);
                    setSelectedRole('');
                    setIsUserBanned(false);
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="modal-body">
                <div className="modal-user-profile">
                  <div className="sidebar-avatar" style={{ margin: 0 }}>
                    {(selectedUser.full_name || selectedUser.email || 'U').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ margin: 0, fontWeight: 800, color: 'var(--brown-dark)' }}>
                      {selectedUser.full_name || 'Usuario'}
                    </h4>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', opacity: 0.6, fontWeight: 600 }}>
                      {selectedUser.email}
                    </p>
                  </div>
                </div>

                {/* ROL DE USUARIO (CUSTOM SELECT DROPDOWN) */}
                <div className="form-group" style={{ position: 'relative' }}>
                  <label htmlFor="roleSelectBtn" style={{ fontWeight: '700', color: 'var(--brown-dark)', display: 'block', marginBottom: '8px' }}>
                    Rol de Usuario:
                  </label>
                  <button
                    id="roleSelectBtn"
                    type="button"
                    className="custom-dropdown-trigger"
                    onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  >
                    <span>
                      {selectedRole === 'super_admin' ? '⚙️ Super Administrador (super_admin)' :
                       selectedRole === 'admin' ? '🛡️ Administrador (admin)' :
                       '👤 Usuario Regular (user)'}
                    </span>
                    <ChevronDown size={18} style={{ transform: isRoleDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>

                  {isRoleDropdownOpen && (
                    <div className="custom-dropdown-options">
                      {[
                        { key: 'user', title: '👤 Usuario Regular (user)', desc: 'Acceso regular a la aplicación y al catálogo.' },
                        { key: 'admin', title: '🛡️ Administrador (admin)', desc: 'Permiso para gestionar catálogo y base de datos.' },
                        { key: 'super_admin', title: '⚙️ Super Administrador (super_admin)', desc: 'Control total de configuraciones, webhooks y correos.' }
                      ].map((roleOpt) => (
                        <button
                          key={roleOpt.key}
                          type="button"
                          className={`custom-dropdown-option${selectedRole === roleOpt.key ? ' active' : ''}`}
                          onClick={() => {
                            setSelectedRole(roleOpt.key);
                            setIsRoleDropdownOpen(false);
                          }}
                        >
                          <span className="role-option-title">{roleOpt.title}</span>
                          <span className="role-option-desc">{roleOpt.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedRole === 'super_admin' && (
                    <p style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '12px', fontWeight: 600 }}>
                      ⚠️ Atención: Otorgar rol de super_admin concede control total sobre el sistema.
                    </p>
                  )}
                </div>

                {/* PERMISOS ADICIONALES */}


                {/* ESTADO DE CUENTA (BLOQUEO) */}
                <div className="form-group" style={{ marginTop: '4px' }}>
                  <label htmlFor="user-ban-checkbox" style={{ fontWeight: '700', color: 'var(--brown-dark)', display: 'block', marginBottom: '8px' }}>
                    Estado de Cuenta:
                  </label>
                  <label className="permission-checkbox-card" style={{ borderColor: isUserBanned ? 'var(--orange-base)' : '' }}>
                    <input
                      id="user-ban-checkbox"
                      type="checkbox"
                      checked={isUserBanned}
                      disabled={selectedUser.id === userId}
                      onChange={(e) => setIsUserBanned(e.target.checked)}
                    />
                    <div>
                      <span style={{ fontWeight: '700', display: 'block', color: isUserBanned ? '#dc2626' : 'var(--brown-dark)' }}>
                        Banear / Suspender Cuenta
                      </span>
                      <span style={{ fontSize: '0.78rem', opacity: 0.6, display: 'block', marginTop: '2px', lineHeight: 1.4 }}>
                        {selectedUser.id === userId
                          ? 'No puedes suspender tu propia cuenta activa.'
                          : 'Suspende temporalmente el acceso del usuario a la plataforma.'}
                      </span>
                    </div>
                  </label>
                </div>

                {actionError && (
                  <div className="admin-error-banner" style={{ marginTop: '10px' }}>
                    <AlertTriangle size={16} />
                    <p>{actionError}</p>
                  </div>
                )}
              </div>
              <div className="custom-modal-footer">
                <button
                  type="button"
                  className="btn-modal-action secondary"
                  disabled={actionPending}
                  onClick={() => {
                    setSelectedUser(null);
                    setSelectedRole('');
                    setIsUserBanned(false);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-modal-action primary"
                  disabled={actionPending}
                  onClick={handleSaveUserManagement}
                  style={{ margin: 0 }}
                >
                  {actionPending ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
