-- =============================================================================
-- MIGRACIÓN: PROTECCIÓN DE LA TABLA DE CONFIGURACIÓN DE RECONCILIACIÓN (RLS)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Habilitar Row Level Security (RLS) en la tabla
ALTER TABLE public.reconciliation_config ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas previas si las hay
DROP POLICY IF EXISTS "Admins and service role full control on reconciliation_config" ON public.reconciliation_config;

-- 3. Crear política restrictiva:
--    Permitir todas las operaciones (SELECT, INSERT, UPDATE, DELETE) únicamente a:
--    a) Usuarios con rol 'super_admin' o 'admin' en la tabla public.user_roles (usando public.has_role)
--    b) Solicitudes del sistema usando la clave de servicio (auth.role() = 'service_role')
CREATE POLICY "Admins and service role full control on reconciliation_config" 
  ON public.reconciliation_config
  FOR ALL
  TO public
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

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
-- Para verificar que RLS está activo y protegiendo los datos:
-- 1. Intenta consultar como usuario anónimo o autenticado estándar (debe devolver 0 filas):
--    SELECT * FROM public.reconciliation_config;
--
-- 2. Las Edge Functions y pg_cron (ejecutado por postgres/superuser) siguen funcionando 
--    correctamente porque el rol de servicio y pg_cron omiten RLS por defecto.
-- =============================================================================
