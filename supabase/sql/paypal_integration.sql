-- 1. Función RPC para asignar credenciales de forma atómica y segura contra condiciones de carrera
CREATE OR REPLACE FUNCTION claim_product_credential_v2(p_product_id UUID, p_order_id UUID)
RETURNS TABLE (username TEXT, password TEXT, extra_data JSONB) AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Bloquea la primera fila de credencial libre exclusivamente para esta transacción
  SELECT id INTO v_id 
  FROM product_credentials_pool
  WHERE product_id = p_product_id AND is_used = false
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_id IS NOT NULL THEN
    UPDATE product_credentials_pool
    SET is_used = true, used_at = now(), used_in_order = p_order_id
    WHERE id = v_id;
    
    RETURN QUERY SELECT username, password, extra_data 
    FROM product_credentials_pool WHERE id = v_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Habilitar extensiones necesarias para automatización periódica en base de datos
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Crear tabla de configuración de reconciliación y generar api_key única
-- 3. Crear esquema privado y tabla de configuración
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.reconciliation_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Habilitar RLS en la tabla privada
ALTER TABLE private.reconciliation_config ENABLE ROW LEVEL SECURITY;

-- Crear política restrictiva: solo Admins y service_role pueden acceder
DROP POLICY IF EXISTS "Admins and service role full control on reconciliation_config" ON private.reconciliation_config;
CREATE POLICY "Admins and service role full control on reconciliation_config" 
  ON private.reconciliation_config
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

-- Crear función RPC segura para que las Edge Functions obtengan la clave API
CREATE OR REPLACE FUNCTION public.get_reconciliation_api_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  IF auth.role() = 'service_role' 
     OR public.has_role(auth.uid(), 'super_admin') 
     OR public.has_role(auth.uid(), 'admin') 
  THEN
    RETURN (SELECT value FROM private.reconciliation_config WHERE key = 'api_key');
  END IF;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reconciliation_api_key() TO anon, authenticated, service_role;

INSERT INTO private.reconciliation_config (key, value)
VALUES ('api_key', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

-- 4. Programación de tarea periódica de reconciliación
-- Desprogramar si ya existía
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'paypal-reconcile-cron-job';

-- Programar de nuevo
SELECT cron.schedule(
  'paypal-reconcile-cron-job',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://plybwnfnmvshroaottby.supabase.co/functions/v1/paypal-reconcile-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM private.reconciliation_config WHERE key = 'api_key')
    )
  );
  $$
);
