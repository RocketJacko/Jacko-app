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

// OCP: Configuración extensible de roles administrativos
const STAFF_ROLES = new Set(["super_admin", "admin", "staff"]);

// Constantes de configuración de seguridad
const SESSION_LOAD_TIMEOUT_MS = 8_000;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isStaff: boolean;
  isSuperAdmin: boolean;
  isSessionLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// DIP: Servicio abstracto para consultar roles (independiza de Supabase DB Query directo en el render)
async function fetchUserRole(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role ?? null;
}

/**
 * Obtiene el identificador del proyecto Supabase a partir de su URL configurada.
 * Utilizado para predecir y validar las llaves de almacenamiento en localStorage.
 */
function getSupabaseProjectRef(): string {
  const url = import.meta.env.VITE_SUPABASE_URL || "";
  try {
    if (url.includes("supabase.co")) {
      return url.split("//")[1]?.split(".")[0] ?? "";
    }
  } catch (e) {
    console.warn("[AuthContext] Error parsing VITE_SUPABASE_URL project ref:", e);
  }
  return "";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // SEGURIDAD: La sesión inicial arranca vacía (null) y en estado de carga (true)
  // para evitar falsos privilegios o destellos de contenido privado antes de consultar al servidor.
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Ref para detectar cambio de usuario entre sesiones (VUL-C1)
  const previousUserIdRef = useRef<string | null>(null);

  // SRP / DRY: Centralización del reseteo de la sesión local y la caché
  const resetLocalSession = useCallback(() => {
    clearAllCache();
    setCurrentUserId(null);
    previousUserIdRef.current = null;
    setSession(null);
    setIsStaff(false);
    setIsSuperAdmin(false);
  }, []);

  /**
   * Obtiene el rol del usuario y actualiza isStaff y isSuperAdmin.
   * Se ejecuta en segundo plano — NUNCA bloquea isSessionLoading.
   */
  const syncUserRole = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setIsStaff(false);
      setIsSuperAdmin(false);
      return;
    }

    try {
      const role = await fetchUserRole(activeSession.user.id);
      if (role) {
        const isSuper = role === "super_admin";
        setIsSuperAdmin(isSuper);
        setIsStaff(isSuper || STAFF_ROLES.has(role));
      } else {
        setIsStaff(false);
        setIsSuperAdmin(false);
      }
    } catch (err) {
      console.error("[AuthContext] Error syncing user role:", err);
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
                resetLocalSession(); // DRY
              }
              setIsSessionLoading(false);
            })
            .catch(() => {
              if (!mounted) return;
              resetLocalSession(); // DRY
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
    const supabaseRef = getSupabaseProjectRef();
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
        // Guard 3: Verificar con el SDK antes de actuar (evita falsos positivos)
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
            resetLocalSession(); // DRY
          })
          .catch(() => {
            // Si no podemos verificar, asumir logout por seguridad
            if (!mounted) return;
            resetLocalSession(); // DRY
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

    // ─── 5. Fallback: forzar fin de loading por seguridad ─────────
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn(
          "[AuthContext] Safety timeout: forcing isSessionLoading=false",
        );
        setIsSessionLoading(false);
      }
    }, SESSION_LOAD_TIMEOUT_MS);

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [syncUserRole, prepareCache, resetLocalSession]);

  const signOut = async () => {
    resetLocalSession(); // DRY
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
