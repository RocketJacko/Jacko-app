import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  LogOut,
  LayoutDashboard,
  Gift,
  ShieldAlert,
  User,
  ShoppingBag,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { 
  IoBarChartOutline, 
  IoTrophyOutline, 
  IoGiftOutline, 
  IoPersonOutline, 
  IoShieldOutline, 
  IoLogOutOutline 
} from 'react-icons/io5';
import './MemberHeader.css';

interface Props {
  currentView: 'landing' | 'dashboard' | 'catalogo' | 'admin' | 'profile';
  dashboardTab?: 'panel' | 'history' | 'activities';
  onViewChange: (
    view: 'landing' | 'dashboard' | 'catalogo' | 'admin' | 'profile',
    tab?: 'panel' | 'history' | 'activities'
  ) => void;
  isStaff?: boolean;
  userEmail: string;
}

export function MemberHeader({
  currentView,
  dashboardTab,
  onViewChange,
  isStaff = false,
  userEmail
}: Props) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(true);
  const [mobileExploreOpen, setMobileExploreOpen] = useState(true);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [alias, setAlias] = useState<string | null>(null);
  const { signOut, user } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const userId = user?.id;
  const username = userEmail.split('@')[0];

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error(err);
    }
  };

  // ── Datos del perfil en tiempo real ──
  useEffect(() => {
    if (!userId) return;
    let active = true;

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url, alias')
        .eq('id', userId)
        .maybeSingle();
      if (!error && data && active) {
        setAvatarUrl(data.avatar_url);
        setAlias(data.alias);
      }
    };

    fetchProfile();

    const ch = supabase
      .channel(`hdr_pts_${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (p) => {
          if (active) {
            setAvatarUrl(p.new?.avatar_url || null);
            setAlias(p.new?.alias || null);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [userId]);

  // ── Cerrar popover al clic fuera ──
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <header className="member-header">
      <div className="member-header-container">
        {/* Brand logo */}
        <button
          type="button"
          className="member-header-brand"
          onClick={() => onViewChange('landing')}
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          <span className="logo-text">JACKO™</span>
        </button>

        {/* Desktop nav links */}
        <nav className="member-nav-desktop">
          <button
            type="button"
            className={`member-nav-link${currentView === 'dashboard' ? ' active' : ''}`}
            onClick={() => onViewChange('dashboard', 'panel')}
          >
            <LayoutDashboard size={16} />
            <span>Mi Panel</span>
          </button>
          <button
            type="button"
            className={`member-nav-link${currentView === 'catalogo' ? ' active' : ''}`}
            onClick={() => onViewChange('catalogo')}
          >
            <Gift size={16} />
            <span>Catálogo</span>
          </button>
          {isStaff && (
            <button
              type="button"
              className={`btn-admin-access${currentView === 'admin' ? ' active' : ''}`}
              onClick={() => onViewChange('admin')}
            >
              <ShieldAlert size={16} />
              <span>Panel Admin</span>
            </button>
          )}
        </nav>

        {/* Hamburguesa Toggle (solo mobile) */}
        <button
          type="button"
          className="member-menu-toggle"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu size={24} />
        </button>

        {/* Zona usuario (solo desktop) */}
        <div ref={dropdownRef} className="member-user-zone">
          <div className="profile-dropdown-wrapper">
            <button
              type="button"
              className={`user-profile-info-btn${avatarUrl ? ' has-avatar' : ''}`}
              onClick={() => setIsProfileOpen((p) => !p)}
              aria-haspopup="menu"
              aria-expanded={isProfileOpen}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="user-avatar-img-round" />
              ) : (
                <User size={14} className="user-icon" />
              )}
              <span className="user-email-text" title={alias || userEmail}>
                {alias || userEmail}
              </span>
              <span className={`chevron-icon${isProfileOpen ? ' rotate' : ''}`}>▾</span>
            </button>

            {isProfileOpen && (
              <div className="profile-dropdown-menu">
                <div className="dropdown-user-header">
                  <div className="dropdown-username">{username}</div>
                  <div className="dropdown-email">{userEmail}</div>
                </div>

                <div className="dropdown-divider" />

                <div className="dropdown-group">
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      onViewChange('dashboard', 'panel');
                      setIsProfileOpen(false);
                    }}
                  >
                    <LayoutDashboard size={14} />
                    <span>Mi Panel</span>
                  </button>
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      onViewChange('catalogo');
                      setIsProfileOpen(false);
                    }}
                  >
                    <Gift size={14} />
                    <span>Catálogo</span>
                  </button>
                  {isStaff && (
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={() => {
                        onViewChange('admin');
                        setIsProfileOpen(false);
                      }}
                    >
                      <ShieldAlert size={14} />
                      <span>Panel Admin</span>
                    </button>
                  )}
                </div>

                <div className="dropdown-divider" />

                <div className="dropdown-group">
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      onViewChange('profile');
                      setIsProfileOpen(false);
                    }}
                  >
                    <User size={14} />
                    <span>Perfil</span>
                  </button>
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      onViewChange('dashboard', 'history');
                      setIsProfileOpen(false);
                    }}
                  >
                    <ShoppingBag size={14} />
                    <span>Compras / Canjes</span>
                  </button>
                  <a
                    href="/refer"
                    onClick={(e) => e.preventDefault()}
                    className="dropdown-item disabled-item"
                  >
                    <div className="flex-between w-full">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Gift size={14} />
                        <span>Referido</span>
                      </div>
                      <span className="badge-soon">Próximamente</span>
                    </div>
                  </a>
                </div>

                <div className="dropdown-divider" />

                <div className="dropdown-group">
                  <button
                    type="button"
                    className="dropdown-item logout-item"
                    onClick={() => {
                      handleLogout();
                      setIsProfileOpen(false);
                    }}
                  >
                    <LogOut size={14} />
                    <span>Cerrar sesión</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Navigation Bar (mobile only) ── */}
      {(() => {
        const bottomLinks = [
          {
            id: 'dashboard-panel',
            label: 'Panel',
            icon: <IoBarChartOutline size={20} />,
            gradientFrom: '#a955ff',
            gradientTo: '#ea51ff',
            action: () => onViewChange('dashboard', 'panel'),
            isActive: currentView === 'dashboard' && (dashboardTab === 'panel' || !dashboardTab),
          },
          {
            id: 'dashboard-activities',
            label: 'Desafíos',
            icon: <IoTrophyOutline size={20} />,
            gradientFrom: '#56CCF2',
            gradientTo: '#2F80ED',
            action: () => onViewChange('dashboard', 'activities'),
            isActive: currentView === 'dashboard' && dashboardTab === 'activities',
          },
          {
            id: 'catalogo',
            label: 'Premios',
            icon: <IoGiftOutline size={20} />,
            gradientFrom: '#FF9966',
            gradientTo: '#FF5E62',
            action: () => onViewChange('catalogo'),
            isActive: currentView === 'catalogo',
          },
          {
            id: 'profile',
            label: 'Perfil',
            icon: avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <IoPersonOutline size={20} />
            ),
            gradientFrom: '#ffa9c6',
            gradientTo: '#f434e2',
            action: () => onViewChange('profile'),
            isActive: currentView === 'profile',
          },
          ...(isStaff
            ? [
                {
                  id: 'admin',
                  label: 'Admin',
                  icon: <IoShieldOutline size={20} />,
                  gradientFrom: '#80FF72',
                  gradientTo: '#7EE8FA',
                  action: () => onViewChange('admin'),
                  isActive: currentView === 'admin',
                },
              ]
            : []),
          {
            id: 'logout',
            label: 'Salir',
            icon: <IoLogOutOutline size={20} />,
            gradientFrom: '#e0e0e0',
            gradientTo: '#909090',
            action: handleLogout,
            isActive: false,
          },
        ];

        return (
          <nav className="member-bottom-nav" aria-label="Navegación principal">
            <ul className="flex gap-2 items-center w-full justify-center">
              {bottomLinks.map((link) => {
                return (
                  <li
                    key={link.id}
                    onClick={link.action}
                    style={{
                      '--gradient-from': link.gradientFrom,
                      '--gradient-to': link.gradientTo,
                    } as React.CSSProperties}
                    className={cn(
                      "relative w-[44px] h-[44px] bg-white rounded-full flex items-center justify-center transition-all duration-500 group cursor-pointer shadow-md select-none",
                      link.isActive ? "w-[110px] shadow-none" : "active:scale-95"
                    )}
                    title={link.label}
                  >
                    {/* Gradient background on active/hover */}
                    <span className={cn(
                      "absolute inset-0 rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] transition-all duration-500",
                      link.isActive ? "opacity-100" : "opacity-0"
                    )}></span>
                    
                    {/* Blur glow */}
                    <span className={cn(
                      "absolute top-[6px] inset-x-0 h-full rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] blur-[8px] -z-10 transition-all duration-500",
                      link.isActive ? "opacity-40" : "opacity-0"
                    )}></span>

                    {/* Icon */}
                    <span className={cn(
                      "relative z-10 transition-all duration-500 delay-0 text-gray-600 flex items-center justify-center",
                      link.isActive ? "scale-0" : "scale-100"
                    )}>
                      {link.icon}
                    </span>

                    {/* Title */}
                    <span className={cn(
                      "absolute text-white uppercase tracking-wider text-[9px] font-extrabold transition-all duration-500 text-center px-1 truncate max-w-[80px]",
                      link.isActive ? "scale-100" : "scale-0"
                    )}>
                      {link.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </nav>
        );
      })()}

      {/* Cajón Móvil */}
      {isMobileMenuOpen && (
        <>
          <div className="mobile-drawer-overlay" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="member-mobile-drawer">
            <div className="member-nav-mobile">
              <div className="mobile-drawer-header">
                <button
                  type="button"
                  className="mobile-drawer-close"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                >
                  <X size={18} />
                </button>
                <div className="mobile-avatar-circle">
                  {alias ? alias.substring(0, 1).toUpperCase() : username.substring(0, 1).toUpperCase()}
                </div>
                <div className="mobile-username">{alias || username}</div>
                <div className="mobile-email">{userEmail}</div>
              </div>

              <div className="mobile-menu-body">
                {/* Sección 1: Mi Cuenta */}
                <div className="mobile-menu-section">
                  <button
                    type="button"
                    className="mobile-section-header"
                    onClick={() => setMobileAccountOpen(!mobileAccountOpen)}
                  >
                    <div className="mobile-header-title-wrap">
                      <User size={16} className="section-header-icon" />
                      <span className="mobile-section-title">Mi Cuenta</span>
                    </div>
                    <span className={`section-chevron${mobileAccountOpen ? ' rotate' : ''}`}>▾</span>
                  </button>

                  {mobileAccountOpen && (
                    <div className="mobile-section-content">
                      <button
                        type="button"
                        className={`member-nav-link-mobile${currentView === 'dashboard' ? ' active' : ''}`}
                        onClick={() => {
                          onViewChange('dashboard', 'panel');
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <LayoutDashboard size={14} />
                        <span>Mi Panel</span>
                      </button>
                      <button
                        type="button"
                        className={`member-nav-link-mobile${currentView === 'profile' ? ' active' : ''}`}
                        onClick={() => {
                          onViewChange('profile');
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <User size={14} />
                        <span>Perfil</span>
                      </button>
                      <button
                        type="button"
                        className="member-nav-link-mobile"
                        onClick={() => {
                          onViewChange('dashboard', 'history');
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <ShoppingBag size={14} />
                        <span>Compras / Canjes</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Sección 2: Explorar */}
                <div className="mobile-menu-section">
                  <button
                    type="button"
                    className="mobile-section-header"
                    onClick={() => setMobileExploreOpen(!mobileExploreOpen)}
                  >
                    <div className="mobile-header-title-wrap">
                      <Gift size={16} className="section-header-icon" />
                      <span className="mobile-section-title">Explorar</span>
                    </div>
                    <span className={`section-chevron${mobileExploreOpen ? ' rotate' : ''}`}>▾</span>
                  </button>

                  {mobileExploreOpen && (
                    <div className="mobile-section-content">
                      <button
                        type="button"
                        className={`member-nav-link-mobile${currentView === 'catalogo' ? ' active' : ''}`}
                        onClick={() => {
                          onViewChange('catalogo');
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <Gift size={14} />
                        <span>Catálogo</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Acceso Admin en mobile */}
                {isStaff && (
                  <div className="mobile-menu-section">
                    <button
                      type="button"
                      className={`btn-admin-access-mobile${currentView === 'admin' ? ' active' : ''}`}
                      onClick={() => {
                        onViewChange('admin');
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      <ShieldAlert size={14} />
                      <span>Panel Admin</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="mobile-menu-footer">
                <button
                  type="button"
                  className="btn-logout-mobile"
                  onClick={() => {
                    handleLogout();
                    setIsMobileMenuOpen(false);
                  }}
                >
                  <LogOut size={14} />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
