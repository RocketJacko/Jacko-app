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
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { 
  IoHomeOutline,
  IoBarChartOutline, 
  IoGiftOutline, 
  IoShieldOutline, 
} from 'react-icons/io5';
import './MemberHeader.css';

interface Props {
  currentView: 'landing' | 'dashboard' | 'catalogo' | 'admin' | 'profile';
  onViewChange: (
    view: 'landing' | 'dashboard' | 'catalogo' | 'admin' | 'profile',
    tab?: 'panel' | 'history' | 'activities'
  ) => void;
  isStaff?: boolean;
  userEmail: string;
}

export function MemberHeader({
  currentView,
  onViewChange,
  isStaff = false,
  userEmail
}: Props) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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

        {/* Unified Header Navigation (Desktop & Mobile) */}
        {(() => {
          const headerLinks = [
            {
              id: 'landing',
              label: 'Inicio',
              icon: <IoHomeOutline size={20} />,
              gradientFrom: '#a955ff',
              gradientTo: '#ea51ff',
              action: () => onViewChange('landing'),
              isActive: currentView === 'landing',
            },
            {
              id: 'dashboard',
              label: 'Panel',
              icon: <IoBarChartOutline size={20} />,
              gradientFrom: '#56CCF2',
              gradientTo: '#2F80ED',
              action: () => onViewChange('dashboard', 'panel'),
              isActive: currentView === 'dashboard',
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
          ];

          return (
            <nav className="member-header-nav">
              <ul className="flex gap-2 md:gap-3 items-center">
                {headerLinks.map((link) => {
                  const isActive = link.isActive;
                  return (
                    <li
                      key={link.id}
                      onClick={link.action}
                      style={{
                        '--gradient-from': link.gradientFrom,
                        '--gradient-to': link.gradientTo,
                      } as React.CSSProperties}
                      className={cn(
                        "relative w-[40px] h-[40px] md:w-[44px] md:h-[44px] bg-white rounded-full flex items-center justify-center transition-all duration-500 group cursor-pointer shadow-sm select-none border border-black/5",
                        isActive ? "w-[110px] md:w-[130px] shadow-none" : "hover:w-[110px] md:hover:w-[130px]"
                      )}
                      title={link.label}
                    >
                      {/* Gradient background on hover/active */}
                      <span className={cn(
                        "absolute inset-0 rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] transition-all duration-500",
                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}></span>
                      
                      {/* Blur glow */}
                      <span className={cn(
                        "absolute top-[6px] inset-x-0 h-full rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] blur-[8px] -z-10 transition-all duration-500",
                        isActive ? "opacity-40" : "opacity-0 group-hover:opacity-40"
                      )}></span>

                      {/* Icon */}
                      <span className={cn(
                        "relative z-10 transition-all duration-500 delay-0 text-gray-600 flex items-center justify-center text-lg md:text-xl",
                        isActive ? "scale-0" : "group-hover:scale-0"
                      )}>
                        {link.icon}
                      </span>

                      {/* Title */}
                      <span className={cn(
                        "absolute text-white uppercase tracking-wider text-[9px] md:text-[10px] font-extrabold transition-all duration-500 text-center px-1 truncate max-w-[80px] md:max-w-[100px]",
                        isActive ? "scale-100" : "scale-0 group-hover:scale-100 delay-150"
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


    </header>
  );
}
