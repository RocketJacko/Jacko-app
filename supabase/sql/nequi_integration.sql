-- =============================================================================
-- INTEGRACIÓN NEQUI VÍA GMAIL API
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

-- 1. Columnas nuevas en tabla orders para soportar pagos Nequi
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS comprobante_url         TEXT,
  ADD COLUMN IF NOT EXISTS nequi_payer_declared    TEXT,
  ADD COLUMN IF NOT EXISTS nequi_bank_declared     TEXT,
  ADD COLUMN IF NOT EXISTS nequi_date_declared     DATE,
  ADD COLUMN IF NOT EXISTS nequi_reference         TEXT,
  ADD COLUMN IF NOT EXISTS nequi_payer             TEXT,
  ADD COLUMN IF NOT EXISTS nequi_bank              TEXT,
  ADD COLUMN IF NOT EXISTS nequi_transaction_id    TEXT,
  ADD COLUMN IF NOT EXISTS nequi_payment_method    TEXT,
  ADD COLUMN IF NOT EXISTS nequi_match_score       NUMERIC(4, 3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nequi_match_status      TEXT DEFAULT NULL;
  -- nequi_match_status: 'auto_approved' | 'pending_review' | 'no_match'

-- Actualizar el check constraint de status para permitir 'pending_nequi'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'pending_nequi'::text]));

COMMENT ON COLUMN orders.comprobante_url IS 'URL del screenshot del comprobante subido por el usuario';
COMMENT ON COLUMN orders.nequi_payer_declared IS 'Nombre del pagador declarado por el usuario en el modal';
COMMENT ON COLUMN orders.nequi_bank_declared IS 'Banco/entidad declarada por el usuario (Davivienda, Bancolombia...)';
COMMENT ON COLUMN orders.nequi_date_declared IS 'Fecha del pago declarada por el usuario (solo fecha, no hora)';
COMMENT ON COLUMN orders.nequi_reference IS 'Referencia Nequi del email (ej. M18716812)';
COMMENT ON COLUMN orders.nequi_payer IS 'Nombre del pagador extraído del email de Nequi';
COMMENT ON COLUMN orders.nequi_bank IS 'Banco extraído del email de Nequi';
COMMENT ON COLUMN orders.nequi_transaction_id IS 'Número de transacción del email de Nequi';
COMMENT ON COLUMN orders.nequi_payment_method IS 'Método de pago del email (ej. QR Negocios Bre-B)';
COMMENT ON COLUMN orders.nequi_match_score IS 'Puntuación del match automatico (0.0 a 1.0)';
COMMENT ON COLUMN orders.nequi_match_status IS 'Estado del match: auto_approved, pending_review, no_match';

-- 2. Índice para búsqueda eficiente de órdenes Nequi pendientes
CREATE INDEX IF NOT EXISTS idx_orders_nequi_pending
  ON orders (status, nequi_date_declared, nequi_bank_declared, amount_cop)
  WHERE status = 'pending_nequi';

-- 3. Tabla de logs de todos los emails de Nequi recibidos (auditoría completa)
CREATE TABLE IF NOT EXISTS nequi_email_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Datos del email
  gmail_message_id  TEXT UNIQUE,      -- ID único del mensaje en Gmail
  email_subject     TEXT,
  email_from        TEXT,

  -- Campos parseados del email de Nequi
  monto             INTEGER NOT NULL,  -- en centavos o pesos enteros
  estado            TEXT,              -- 'Aprobada', 'Rechazada', etc.
  fecha_email       TIMESTAMPTZ,       -- fecha/hora del email de Nequi
  pagador           TEXT,
  banco             TEXT,
  referencia        TEXT,
  numero_transaccion TEXT,
  metodo_pago       TEXT,

  -- Resultado del match
  matched_order_id  UUID REFERENCES orders(id),
  match_score       NUMERIC(4, 3),
  match_status      TEXT,             -- 'auto_approved' | 'pending_review' | 'no_match'

  -- Log raw
  raw_email_body    TEXT,             -- cuerpo completo del email para depuración

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE nequi_email_logs IS 'Registro de todos los emails de confirmación de Nequi recibidos';

-- Índice para buscar por fecha de email (útil para matching por día)
CREATE INDEX IF NOT EXISTS idx_nequi_logs_fecha ON nequi_email_logs (fecha_email DESC);
CREATE INDEX IF NOT EXISTS idx_nequi_logs_monto ON nequi_email_logs (monto);
CREATE INDEX IF NOT EXISTS idx_nequi_logs_matched_order ON nequi_email_logs (matched_order_id) WHERE matched_order_id IS NOT NULL;

-- 4. Row Level Security para nequi_email_logs (solo admin puede ver)
ALTER TABLE nequi_email_logs ENABLE ROW LEVEL SECURITY;

-- Solo service_role (Edge Functions) y admins pueden leer
CREATE POLICY "Admin read nequi_email_logs"
  ON nequi_email_logs FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Solo service_role puede insertar/actualizar
CREATE POLICY "Service role insert nequi_email_logs"
  ON nequi_email_logs FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role update nequi_email_logs"
  ON nequi_email_logs FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 5. Storage bucket para comprobantes de Nequi
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nequi-comprobantes',
  'nequi-comprobantes',
  false,                                        -- privado: no acceso público directo
  5242880,                                      -- 5 MB máximo por archivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage: el propietario puede subir, solo admins y service_role pueden ver
CREATE POLICY "Users can upload own comprobante"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'nequi-comprobantes'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Admin or owner can read comprobante"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'nequi-comprobantes'
    AND (
      auth.jwt() ->> 'role' = 'service_role'
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    )
  );

-- 6. Cron job para renovar el Gmail watch cada 6 días (expira en 7)
--    El watch se registra la primera vez manualmente llamando a la Edge Function nequi-gmail-watch

-- Desprogramar si ya existía
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nequi-gmail-watch-renew') THEN
    PERFORM cron.unschedule('nequi-gmail-watch-renew');
  END IF;
END $$;

-- Programar renovación automática cada 6 días a las 3am (hora Colombia UTC-5 = 8am UTC)
SELECT cron.schedule(
  'nequi-gmail-watch-renew',
  '0 8 */6 * *',
  $$
  SELECT net.http_post(
    url := 'https://plybwnfnmvshroaottby.supabase.co/functions/v1/nequi-gmail-watch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM private.reconciliation_config WHERE key = 'api_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
-- Verificar columnas agregadas a orders:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'orders' AND column_name LIKE 'nequi_%';

-- Verificar tabla logs:
-- SELECT * FROM nequi_email_logs LIMIT 1;

-- Verificar bucket:
-- SELECT * FROM storage.buckets WHERE id = 'nequi-comprobantes';
