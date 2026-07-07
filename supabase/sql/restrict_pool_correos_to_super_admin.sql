-- =============================================================================
-- MIGRACIÓN: RESTRICCIÓN DE POOL DE CORREOS EXCLUSIVA A SUPER ADMIN
-- Ejecutar en el Editor SQL de Supabase
-- =============================================================================

-- 1. Eliminar la política anterior de administradores generales
DROP POLICY IF EXISTS "Admins full control on pool_correos" ON public.pool_correos;

-- 2. Crear la nueva política restrictiva para Super Admins únicamente
CREATE POLICY "SuperAdmins full control on pool_correos"
  ON public.pool_correos
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR auth.jwt() ->> 'role' = 'service_role'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR auth.jwt() ->> 'role' = 'service_role'
  );
