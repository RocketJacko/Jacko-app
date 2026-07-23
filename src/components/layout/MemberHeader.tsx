import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  LogOut,
  LayoutDashboard,
  Gift,
  ShieldAlert,
  User,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { 
  IoHomeOutline,
  IoGiftOutline, 
  IoShieldOutline, 
  IoReceiptOutline,
  IoMenuOutline,
  IoCloseOutline,
} from 'react-icons/io5';
import './MemberHeader.css';

interface Props {
  currentView: 'landing' | 'dashboard' | 'catalogo' | 'admin' | 'profile';
  activeDashboardTab?: 'panel' | 'history';
  onViewChange: (
    view: 'landing' | 'dashboard' | 'catalogo' | 'admin' | 'profile',
    tab?: 'panel' | 'history'
  ) => void;
  isStaff?: boolean;
  userEmail: string;
}

export function MemberHeader({
  currentView,
  activeDashboardTab = 'panel',
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
        {/* Logo a la izquierda */}
        <button
          type="button"
          className="member-header-brand"
          onClick={() => onViewChange('dashboard', 'panel')}
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          <span className="logo-text">JACKO™</span>
        </button>

        {/* Zona Derecha: Hamburguesa a la extrema derecha y menú desplegándose de Derecha a Izquierda hacia el logo */}
        {(() => {
          const [isMenuOpen, setIsMenuOpen] = useState(false);
          const [hoveredId, setHoveredId] = useState<string | null>(null);
          const navRef = useRef<HTMLDivElement>(null);

          // Cerrar menú al clic fuera
          useEffect(() => {
            const handleOutsideClick = (e: MouseEvent) => {
              if (navRef.current && !navRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false);
                setIsProfileOpen(false);
              }
            };
            document.addEventListener('mousedown', handleOutsideClick);
            return () => document.removeEventListener('mousedown', handleOutsideClick);
          }, []);

          const headerLinks = [
            {
              id: 'panel',
              label: 'Resumen',
              icon: <IoHomeOutline size={18} />,
              gradientFrom: '#a955ff',
              gradientTo: '#ea51ff',
              action: () => {
                onViewChange('dashboard', 'panel');
                setIsMenuOpen(false);
                setIsProfileOpen(false);
              },
              isActive: currentView === 'dashboard' && activeDashboardTab === 'panel',
            },

            {
              id: 'history',
              label: 'Historial',
              icon: <IoReceiptOutline size={18} />,
              gradientFrom: '#FF9966',
              gradientTo: '#FF5E62',
              action: () => {
                onViewChange('dashboard', 'history');
                setIsMenuOpen(false);
                setIsProfileOpen(false);
              },
              isActive: currentView === 'dashboard' && activeDashboardTab === 'history',
            },
            {
              id: 'catalogo',
              label: 'Premios',
              icon: <IoGiftOutline size={18} />,
              gradientFrom: '#FF9966',
              gradientTo: '#FF5E62',
              action: () => {
                onViewChange('catalogo');
                setIsMenuOpen(false);
                setIsProfileOpen(false);
              },
              isActive: currentView === 'catalogo',
            },
            ...(isStaff
              ? [
                  {
                    id: 'admin',
                    label: 'Admin',
                    icon: <IoShieldOutline size={18} />,
                    gradientFrom: '#80FF72',
                    gradientTo: '#7EE8FA',
                    action: () => {
                      onViewChange('admin');
                      setIsMenuOpen(false);
                      setIsProfileOpen(false);
                    },
                    isActive: currentView === 'admin',
                  },
                ]
              : []),
          ];

          return (
            <div ref={navRef} className="relative flex items-center gap-2 ml-auto md:mx-auto min-w-0 flex-shrink-0">
              {/* Cinta horizontal: visible e integrada en escritorio, desplegable con hamburguesa solo en móvil */}
              <div className={cn(
                "flex items-center gap-1 md:gap-2 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden pointer-events-auto",
                "md:max-w-none md:opacity-100 md:translate-x-0",
                isMenuOpen 
                  ? "max-w-[calc(100vw-160px)] opacity-100 translate-x-0" 
                  : "max-w-0 opacity-0 translate-x-4 pointer-events-none md:pointer-events-auto"
              )}>
                <ul className="flex gap-1 md:gap-2 items-center p-1 rounded-full bg-white/40 backdrop-blur-md border border-white/40 shadow-sm max-w-full overflow-x-auto no-scrollbar">
                  {headerLinks.map((link) => {
                    const isActive = link.isActive;
                    const isHovered = hoveredId === link.id;
                    const isExpanded = isHovered;

                    return (
                      <li
                        key={link.id}
                        onClick={link.action}
                        onMouseEnter={() => setHoveredId(link.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{
                          '--gradient-from': link.gradientFrom,
                          '--gradient-to': link.gradientTo,
                        } as React.CSSProperties}
                        className={cn(
                          "relative h-[36px] md:h-[40px] bg-white rounded-full flex items-center justify-center transition-all duration-500 group cursor-pointer shadow-sm select-none border border-black/5",
                          isActive ? "ring-2 ring-amber-500/60" : "",
                          isExpanded
                            ? "w-[95px] md:w-[125px] shadow-none"
                            : "w-[36px] md:w-[40px]"
                        )}
                        title={link.label}
                      >
                        <span className={cn(
                          "absolute inset-0 rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] transition-all duration-500",
                          isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}></span>
                        
                        <span className={cn(
                          "absolute top-[4px] inset-x-0 h-full rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] blur-[8px] -z-10 transition-all duration-500",
                          isExpanded ? "opacity-40" : "opacity-0 group-hover:opacity-40"
                        )}></span>

                        <span className={cn(
                          "relative z-10 transition-all duration-500 delay-0 text-gray-600 flex items-center justify-center text-base md:text-lg",
                          isExpanded ? "scale-0" : "group-hover:scale-0"
                        )}>
                          {link.icon}
                        </span>

                        <span className={cn(
                          "absolute text-white uppercase tracking-wider text-[9px] md:text-[10px] font-extrabold transition-all duration-500 text-center px-1 truncate max-w-[75px] md:max-w-[100px]",
                          isExpanded ? "scale-100" : "scale-0 group-hover:scale-100 delay-150"
                        )}>
                          {link.label}
                        </span>
                      </li>
                    );
                  })}

                  {/* Botón de Perfil Integrado en la cinta */}
                  <li
                    onClick={() => setIsProfileOpen((p) => !p)}
                    style={{
                      '--gradient-from': '#FF512F',
                      '--gradient-to': '#DD2476',
                    } as React.CSSProperties}
                    className={cn(
                      "relative h-[36px] md:h-[40px] bg-white rounded-full flex items-center justify-center transition-all duration-500 group cursor-pointer shadow-sm select-none border border-black/5 list-none",
                      isProfileOpen
                        ? "w-[110px] md:w-[135px] shadow-none"
                        : "w-[36px] md:w-[40px] hover:w-[110px] md:hover:w-[135px]"
                    )}
                    title={alias || userEmail}
                  >
                    <span className={cn(
                      "absolute inset-0 rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] transition-all duration-500",
                      isProfileOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}></span>
                    
                    <span className={cn(
                      "absolute top-[4px] inset-x-0 h-full rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] blur-[8px] -z-10 transition-all duration-500",
                      isProfileOpen ? "opacity-40" : "opacity-0 group-hover:opacity-40"
                    )}></span>

                    <span className={cn(
                      "relative z-10 w-full h-full transition-all duration-500 delay-0 text-gray-600 flex items-center justify-center text-base md:text-lg overflow-hidden rounded-full",
                      isProfileOpen ? "scale-0" : "group-hover:scale-0"
                    )}>
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <User size={18} />
                      )}
                    </span>

                    <span className={cn(
                      "absolute text-white uppercase tracking-wider text-[9px] md:text-[10px] font-extrabold transition-all duration-500 text-center px-1 truncate max-w-[85px] md:max-w-[110px]",
                      isProfileOpen ? "scale-100" : "scale-0 group-hover:scale-100 delay-150"
                    )}>
                      {alias || username}
                    </span>
                  </li>
                </ul>
              </div>

              {/* ÚNICO Botón en la Extrema Derecha: Botón Hamburguesa */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen((prev) => !prev);
                  if (isProfileOpen) setIsProfileOpen(false);
                }}
                style={{
                  '--gradient-from': '#36D1DC',
                  '--gradient-to': '#5B86E5',
                } as React.CSSProperties}
                className={cn(
                  "relative h-[36px] md:h-[40px] bg-white rounded-full flex md:hidden items-center justify-center transition-all duration-500 group cursor-pointer shadow-sm select-none border border-black/5 w-[36px] md:w-[40px]",
                  isMenuOpen ? "shadow-none" : "hover:scale-105"
                )}
                title="Menú de Navegación"
              >
                <span className={cn(
                  "absolute inset-0 rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] transition-all duration-500",
                  isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}></span>
                
                <span className={cn(
                  "absolute top-[4px] inset-x-0 h-full rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] blur-[8px] -z-10 transition-all duration-500",
                  isMenuOpen ? "opacity-40" : "opacity-0 group-hover:opacity-40"
                )}></span>

                <span className={cn(
                  "relative z-10 transition-all duration-500 flex items-center justify-center text-lg md:text-xl",
                  isMenuOpen ? "text-white rotate-90" : "text-gray-700 group-hover:text-white"
                )}>
                  {isMenuOpen ? <IoCloseOutline size={22} /> : <IoMenuOutline size={22} />}
                </span>
              </button>

              {/* Popover del Perfil al hacer clic en la píldora de perfil dentro de la cinta */}
              {isProfileOpen && (
                <div ref={dropdownRef} className="profile-dropdown-menu">
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
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={() => {
                        onViewChange('profile');
                        setIsProfileOpen(false);
                      }}
                    >
                      <User size={14} />
                      <span>Editar Perfil</span>
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
          );
        })()}
      </div>
    </header>
  );
}
