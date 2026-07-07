-- =============================================================================
-- MIGRACIÓN: CORRECCIÓN DE POLÍTICA DE LECTURA DE LOGS DE NEQUI
-- Asegura el uso correcto de public.has_role() en lugar de raw_app_meta_data.
-- Ejecutar en: Editor SQL de Supabase
-- =============================================================================

-- 1. Eliminar la política legacy que dependía de raw_app_meta_data
DROP POLICY IF EXISTS "Admin read nequi_email_logs" ON public.nequi_email_logs;

-- 2. Crear la nueva política de lectura unificada utilizando la tabla de roles
CREATE POLICY "Admin read nequi_email_logs" ON public.nequi_email_logs
  FOR SELECT
  TO authenticated
  USING (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  );
