-- =============================================================================
-- MIGRACIÓN: TRASLADO DE CONFIGURACIÓN A ESQUEMA PRIVADO Y FUNCIÓN RPC SEGURA
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Crear esquema privado para configuraciones internas
CREATE SCHEMA IF NOT EXISTS private;

-- 2. Mover la tabla del esquema public al private si existe en public
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'reconciliation_config'
  ) THEN
    ALTER TABLE public.reconciliation_config SET SCHEMA private;
  END IF;
END $$;

-- 3. Crear la tabla en el esquema private si no existe
CREATE TABLE IF NOT EXISTS private.reconciliation_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 4. Habilitar RLS en la tabla del esquema private
ALTER TABLE private.reconciliation_config ENABLE ROW LEVEL SECURITY;

-- 5. Crear función puente de seguridad en el esquema público
--    Debe ser SECURITY DEFINER para que corra con privilegios de superusuario y pueda
--    consultar la tabla dentro del esquema private. Se restringe explícitamente
--    el search_path por recomendación de seguridad de Postgres.
CREATE OR REPLACE FUNCTION public.get_reconciliation_api_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  -- Restringir la ejecución de la lógica únicamente a solicitudes autenticadas
  -- que tengan rol 'service_role' o sean administradores en la tabla user_roles.
  IF auth.role() = 'service_role' 
     OR public.has_role(auth.uid(), 'super_admin') 
     OR public.has_role(auth.uid(), 'admin') 
  THEN
    RETURN (SELECT value FROM private.reconciliation_config WHERE key = 'api_key');
  END IF;
  
  -- Para cualquier otro rol, denegar acceso retornando NULL
  RETURN NULL;
END;
$$;

-- Otorgar privilegios de ejecución para la API de Supabase PostgREST
GRANT EXECUTE ON FUNCTION public.get_reconciliation_api_key() TO anon, authenticated, service_role;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
-- 1. La tabla `reconciliation_config` ya no debe aparecer en el listado de tablas de Supabase REST.
-- 2. Intenta hacer una consulta REST:
--    curl https://<project-id>.supabase.co/rest/v1/reconciliation_config
--    (Deberá responder 404 Not Found porque la tabla ya no existe en el esquema public).
-- 3. Llamar a la RPC sin autenticación:
--    SELECT public.get_reconciliation_api_key(); -- Deberá retornar NULL.
-- =============================================================================
