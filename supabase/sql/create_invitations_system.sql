-- 1. Crear tabla de invitados
CREATE TABLE IF NOT EXISTS public.invitados (
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invitados_pkey PRIMARY KEY (email)
);

-- 2. Habilitar RLS en invitados
ALTER TABLE public.invitados ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS en invitados
DROP POLICY IF EXISTS admin_all ON public.invitados;
CREATE POLICY admin_all ON public.invitados
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS user_read_own ON public.invitados;
CREATE POLICY user_read_own ON public.invitados
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.jwt()->>'email'));

-- 3. Crear función de verificación de estado de invitado
CREATE OR REPLACE FUNCTION public.is_current_user_invited()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.invitados 
    WHERE lower(email) = lower(auth.jwt()->>'email')
  );
END;
$$;

-- 4. Agregar columna visibility a public.products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

-- 5. Actualizar políticas de RLS en public.products
DROP POLICY IF EXISTS products_select_authenticated ON public.products;
CREATE POLICY products_select_authenticated ON public.products
  FOR SELECT
  TO authenticated
  USING (
    (
      (is_active = true AND (visibility = 'public' OR (visibility = 'invited_only' AND public.is_current_user_invited())))
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );
