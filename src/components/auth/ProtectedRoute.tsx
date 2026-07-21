import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { LoadingScreen } from "../layout/LoadingScreen";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireStaff?: boolean;
}

export function ProtectedRoute({ children, requireStaff = false }: ProtectedRouteProps) {
  const { session, isSessionLoading, isStaff } = useAuth();

  // 1. Mostrar pantalla de carga premium si Supabase está validando el token
  if (isSessionLoading) {
    return <LoadingScreen />;
  }

  // 2. Si no hay sesión iniciada, redirigir a la landing page
  if (!session) {
    return <Navigate to="/" replace />;
  }

  // 3. Si requiere staff y el usuario no lo es, redirigir a su panel personal
  if (requireStaff && !isStaff) {
    return <Navigate to="/dashboard" replace />;
  }

  // 4. Si todo es correcto, permitir acceso a los hijos
  return <>{children}</>;
}
