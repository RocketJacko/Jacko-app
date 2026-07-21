import { m } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import './DockNav.css';

interface Props {
  isVisible?: boolean;
  currentView: 'landing' | 'dashboard' | 'catalogo' | 'admin';
  onViewChange: (view: 'landing' | 'dashboard' | 'catalogo' | 'admin') => void;
  isStaff?: boolean;
}

export function DockNav({
  isVisible = false,
  currentView,
  onViewChange,
  isStaff = false,
}: Props) {
  const { session, signOut } = useAuth();
  const isLoggedIn = !!session;
  const userEmail = session?.user?.email || '';

  const links = isLoggedIn
    ? [
        {
          id: 'landing',
          icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
          label: 'Inicio',
        },
        {
          id: 'dashboard',
          icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
          label: 'Mi Panel',
        },
        {
          id: 'catalogo',
          icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
          label: 'Catálogo de Premios',
        },
        ...(isStaff
          ? [{ id: 'admin', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', label: 'Panel Admin' }]
          : []),
        {
          id: 'logout',
          icon: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
          label: `Cerrar Sesión (${userEmail})`,
        },
      ]
    : [
        {
          id: 'landing',
          icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
          label: 'Inicio',
        },
        {
          id: 'register',
          icon: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h3a3 3 0 013 3v1',
          label: 'Ingreso / Registro',
        },
      ];

  const handleScroll = async (id: string) => {
    if (id === 'landing' || id === 'dashboard' || id === 'catalogo' || id === 'admin') {
      onViewChange(id as 'landing' | 'dashboard' | 'catalogo' | 'admin');
      if (id === 'landing') {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('scroll-to-section', { detail: 'inicio' }));
        }, 50);
      }
      return;
    }
    if (id === 'pricing') {
      onViewChange('landing');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('scroll-to-section', { detail: 'pricing' }));
      }, 50);
      return;
    }
    if (id === 'register') {
      onViewChange('landing');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-login-form'));
        window.dispatchEvent(new CustomEvent('scroll-to-section', { detail: 'register' }));
      }, 50);
      return;
    }
    if (id === 'logout') {
      try {
        await signOut();
      } catch (err) {
        console.error('Error signing out:', err);
      }
      return;
    }
  };

  return (
    <nav
      id="dock-nav-top"
      className="dock-nav-top-bar"
      style={{
        opacity: isVisible ? 1 : 0,
        visibility: isVisible ? 'visible' : 'hidden',
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
    >
      <div className="dock-links-container-top">
        {links.map((link) => {
          const isActive = link.id === currentView;
          return (
            <m.button
              key={link.id}
              className={`dock-btn-top${isActive ? ' active' : ''}`}
              whileHover={{
                scale: 1.1,
                backgroundColor: isActive
                  ? 'rgba(212, 98, 26, 0.35)'
                  : 'rgba(232, 221, 200, 0.15)',
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleScroll(link.id)}
              title={link.label}
              aria-label={link.label}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d={link.icon}
                />
              </svg>
            </m.button>
          );
        })}
      </div>
    </nav>
  );
}