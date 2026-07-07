/**
 * AuthContext.tsx — JACKO™
 * Gestión de sesión con:
 *  - isSessionLoading se libera en cuanto la sesión se conoce (no bloquea por syncUserRole)
 *  - Limpieza de caché al cambiar de usuario (VUL-C1)
 *  - Guard contra SIGNED_OUT espureos en conexiones lentas
 *  - Sincronización entre pestañas via StorageEvent (VUL-C6)
 *  - Refresh de sesión al volver a la pestaña (visibilitychange)
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { supabase } from "../lib/supabaseClient";
import type { Session, User } from "@supabase/supabase-js";
import {
  clearAllCache,
  invalidateCacheByPrefix,
  setCurrentUserId,
} from "../lib/queryCache";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isStaff: boolean;
  isSuperAdmin: boolean;
  isSessionLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Ref para detectar cambio de usuario entre sesiones (VUL-C1)
  const previousUserIdRef = useRef<string | null>(null);

  /**
   * Obtiene el rol del usuario y actualiza isStaff.
   * Se ejecuta en segundo plano — NUNCA bloquea isSessionLoading.
   */
  const syncUserRole = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setIsStaff(false);
      setIsSuperAdmin(false);
      return;
    }
    try {
      const { data } = await supabase.rpc("get_my_access");
      if (data && data.length > 0) {
        setIsStaff(data[0].is_admin || data[0].is_super_admin);
        setIsSuperAdmin(data[0].is_admin || data[0].is_super_admin);
      } else {
        setIsStaff(false);
        setIsSuperAdmin(false);
      }
    } catch (err) {
      console.error("[AuthContext] Error fetching user role:", err);
      setIsStaff(false);
      setIsSuperAdmin(false);
    }
  }, []);

  /**
   * Activa/limpia caché al cambiar de usuario.
   * Retorna sin awaitar syncUserRole — el rol se carga en background.
   */
  const prepareCache = useCallback((newSession: Session | null) => {
    if (!newSession?.user) {
      setCurrentUserId(null);
      return;
    }

    const newUserId = newSession.user.id;

    if (previousUserIdRef.current && previousUserIdRef.current !== newUserId) {
      console.info("[AuthContext] Cambio de usuario — limpiando caché.");
      clearAllCache();
    } else if (previousUserIdRef.current === newUserId) {
      invalidateCacheByPrefix("dashboard_data_" + newUserId);
    }

    // Establecer userId actual para validación de L2 entries
    setCurrentUserId(newUserId);
    previousUserIdRef.current = newUserId;
  }, []);

  useEffect(() => {
    let mounted = true;

    // ─── 1. Cargar sesión inicial ───────────────────────────────────────────
    supabase.auth
      .getSession()
      .then(({ data: { session: initial } }) => {
        if (!mounted) return;
        prepareCache(initial);
        setSession(initial);
        // Liberar loading INMEDIATAMENTE al conocer la sesión
        setIsSessionLoading(false);
        // Rol se carga en segundo plano (no bloquea la UI)
        syncUserRole(initial);
      })
      .catch((err) => {
        console.error("[AuthContext] Error loading initial session:", err);
        if (mounted) setIsSessionLoading(false);
      });

    // ─── 2. Suscribirse a cambios de auth ──────────────────────────────────
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      switch (event) {
        case "SIGNED_IN":
        case "USER_UPDATED":
          prepareCache(newSession);
          setSession(newSession);
          setIsSessionLoading(false);
          // Rol en background
          syncUserRole(newSession);
          break;

        case "TOKEN_REFRESHED":
          // Solo actualiza el token — no re-carga rol ni interfiere con caché
          setSession(newSession);
          break;

        case "SIGNED_OUT":
          // Verificar antes de limpiar (guard contra SIGNED_OUT espureos)
          supabase.auth
            .getSession()
            .then(({ data }) => {
              if (!mounted) return;
              if (data.session) {
                // Sesión sigue válida — restaurar sin borrar caché
                setSession(data.session);
              } else {
                clearAllCache();
                setCurrentUserId(null);
                previousUserIdRef.current = null;
                setSession(null);
                setIsStaff(false);
                setIsSuperAdmin(false);
              }
              setIsSessionLoading(false);
            })
            .catch(() => {
              if (!mounted) return;
              clearAllCache();
              setCurrentUserId(null);
              previousUserIdRef.current = null;
              setSession(null);
              setIsStaff(false);
              setIsSuperAdmin(false);
              setIsSessionLoading(false);
            });
          break;

        default:
          setSession(newSession);
          setIsSessionLoading(false);
          break;
      }
    });

    // ─── 3. Refresh al volver a la pestaña ─────────────────────────────────
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      supabase.auth.getSession().then(({ data: { session: current } }) => {
        if (!mounted || !current) return;
        setSession(current);
      });
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // ─── 4. Sync cross-tab via StorageEvent (VUL-C6) ──────────────────────
    //
    // Validaciones estrictas (CRÍTICO 2):
    //  - Verificar e.storageArea === localStorage (no sessionStorage/IndexedDB)
    //  - Key matching exacto contra el patrón de Supabase Auth
    //  - Confirmar con supabase.auth.getSession() antes de actuar
    //    (no confiamos ciegamente en el evento — podría ser una extensión)
    //
    // El patrón de la clave de Supabase Auth es:
    //   sb-{project-ref}-auth-token
    const supabaseRef =
      (import.meta.env.VITE_SUPABASE_URL || "").split("//")[1]?.split(".")[0] ??
      "";
    const expectedStorageKey = supabaseRef
      ? `sb-${supabaseRef}-auth-token`
      : null;

    const handleStorageChange = (e: StorageEvent) => {
      if (!mounted) return;

      // Guard 1: Solo eventos de localStorage (no sessionStorage ni otros)
      if (e.storageArea !== localStorage) return;

      // Guard 2: Solo reaccionar a la clave exacta de Supabase Auth
      if (!expectedStorageKey || e.key !== expectedStorageKey) return;

      if (!e.newValue) {
        // Otra pestaña parece haber cerrado sesión.
        // Guard 3: Verificar con el SDK antes de actuar (evita falsos positivos
        // por extensiones del browser o limpieza accidental de storage).
        supabase.auth
          .getSession()
          .then(({ data }) => {
            if (!mounted) return;
            if (data.session) {
              // La sesión sigue válida en el SDK — ignorar el evento (falso positivo)
              console.info(
                "[AuthContext] StorageEvent: clave borrada pero sesión SDK válida — ignorando.",
              );
              return;
            }
            // Sesión realmente cerrada
            clearAllCache();
            setCurrentUserId(null);
            previousUserIdRef.current = null;
            setSession(null);
            setIsStaff(false);
            setIsSuperAdmin(false);
          })
          .catch(() => {
            // Si no podemos verificar, asumir logout por seguridad
            if (!mounted) return;
            clearAllCache();
            setCurrentUserId(null);
            previousUserIdRef.current = null;
            setSession(null);
            setIsStaff(false);
            setIsSuperAdmin(false);
          });
      } else if (e.newValue && !e.oldValue) {
        // Otra pestaña inició sesión — refrescar
        supabase.auth.getSession().then(({ data: { session: current } }) => {
          if (!mounted || !current) return;
          prepareCache(current);
          setSession(current);
          syncUserRole(current);
        });
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // ─── 5. Fallback: forzar fin de loading a los 8s por seguridad ─────────
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn(
          "[AuthContext] Safety timeout: forcing isSessionLoading=false",
        );
        setIsSessionLoading(false);
      }
    }, 8_000);

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [syncUserRole, prepareCache]);

  const signOut = async () => {
    clearAllCache();
    setCurrentUserId(null);
    previousUserIdRef.current = null;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isStaff,
        isSuperAdmin,
        isSessionLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
