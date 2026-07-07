-- =============================================================================
-- MIGRACIÓN: TABLA DE PERMISOS DE USUARIO Y BYPASS PARA SUPER ADMIN
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Crear tabla de permisos de usuario
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT unique_user_permission UNIQUE (user_id, permission)
);

-- 2. Habilitar Row Level Security (RLS) en la tabla
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas de RLS para public.user_permissions
DROP POLICY IF EXISTS "Admins can manage user permissions" ON public.user_permissions;
CREATE POLICY "Admins can manage user permissions" ON public.user_permissions
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') 
    OR public.has_role(auth.uid(), 'admin')
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') 
    OR public.has_role(auth.uid(), 'admin')
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "Users can read own permissions" ON public.user_permissions;
CREATE POLICY "Users can read own permissions" ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
  );

-- 4. Sobrescribir la función de verificación de estado de invitado
--    Esta función ahora comprueba si el usuario:
--    a) Es administrador o super_administrador (acceso total inmediato)
--    b) Está en la lista de invitados por correo electrónico
--    c) Tiene el permiso específico 'access_invited_products'
CREATE OR REPLACE FUNCTION public.is_current_user_invited()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- a) Si es super_admin o admin, ver todo automáticamente
  IF public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') THEN
    RETURN TRUE;
  END IF;

  -- b) Si está en la tabla de invitados por correo
  IF EXISTS (
    SELECT 1 
    FROM public.invitados 
    WHERE lower(email) = lower(auth.jwt()->>'email')
  ) THEN
    RETURN TRUE;
  END IF;

  -- c) Si tiene el permiso 'access_invited_products' asignado por ID de usuario
  IF EXISTS (
    SELECT 1 
    FROM public.user_permissions 
    WHERE user_id = auth.uid() 
      AND permission = 'access_invited_products'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.is_current_user_invited IS 'Determina si el usuario actual tiene acceso a productos exclusivos (por rol admin, por lista invitados o por tabla permisos)';
