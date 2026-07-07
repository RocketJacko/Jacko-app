-- =============================================================================
-- DESHACER MIGRACIÓN: REVERTIR ESTANDARIZACIÓN DE IDIOMA (VOLVER A ESPAÑOL)
-- Ejecutar en el Editor SQL de Supabase en caso de contingencia
-- =============================================================================

BEGIN;

-- 1. Revertir invited_users a invitados
ALTER TABLE IF EXISTS public.invited_users RENAME TO invitados;

-- Revertir políticas
DROP POLICY IF EXISTS admin_all ON public.invitados;
CREATE POLICY admin_all ON public.invitados
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::text) OR public.has_role(auth.uid(), 'admin'::text));

DROP POLICY IF EXISTS user_read_own ON public.invitados;
CREATE POLICY user_read_own ON public.invitados
  FOR SELECT TO public
  USING (lower(email) = lower((auth.jwt() ->> 'email'::text)));

-- 2. Revertir email_pool a pool_correos
ALTER TABLE IF EXISTS public.email_pool RENAME TO pool_correos;

-- Revertir columnas
ALTER TABLE IF EXISTS public.pool_correos RENAME COLUMN created_at TO fecha_creacion;
ALTER TABLE IF EXISTS public.pool_correos RENAME COLUMN status TO estado;
ALTER TABLE IF EXISTS public.pool_correos RENAME COLUMN assigned_user_id TO usuario_asignado;

-- Revertir valores de estado
UPDATE public.pool_correos SET estado = 'sin_asignar' WHERE estado = 'unassigned';
UPDATE public.pool_correos SET estado = 'asignado' WHERE estado = 'assigned';
UPDATE public.pool_correos SET estado = 'bloqueado' WHERE estado = 'blocked';

ALTER TABLE public.pool_correos DROP CONSTRAINT IF EXISTS email_pool_status_check;
ALTER TABLE public.pool_correos ADD CONSTRAINT pool_correos_estado_check CHECK (estado = ANY (ARRAY['sin_asignar'::text, 'asignado'::text, 'bloqueado'::text]));

-- Revertir RLS
DROP POLICY IF EXISTS "SuperAdmins full control on email_pool" ON public.pool_correos;
CREATE POLICY "SuperAdmins full control on pool_correos"
  ON public.pool_correos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::text) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can read own assigned email" ON public.pool_correos;
CREATE POLICY "Users can read own assigned email"
  ON public.pool_correos FOR SELECT TO public
  USING (usuario_asignado = auth.uid());

-- Recrear índices antiguos
DROP INDEX IF EXISTS public.idx_email_pool_plan_status;
DROP INDEX IF EXISTS public.idx_email_pool_plan_status_date;
DROP INDEX IF EXISTS public.idx_email_pool_assigned_user;

CREATE INDEX IF NOT EXISTS idx_pool_correos_plan_estado ON public.pool_correos (plan_id, estado);
CREATE INDEX IF NOT EXISTS idx_pool_correos_plan_estado_fecha ON public.pool_correos (plan_id, estado, fecha_creacion ASC);
CREATE INDEX IF NOT EXISTS idx_pool_correos_usuario_asignado ON public.pool_correos (usuario_asignado);

-- 3. Revertir profiles (drop columns, rename columns)
ALTER TABLE public.profiles RENAME COLUMN city TO ciudad;
ALTER TABLE public.profiles RENAME COLUMN last_login_ip TO ultimo_acceso_ip;
ALTER TABLE public.profiles RENAME COLUMN last_login_device TO ultimo_acceso_dispositivo;
ALTER TABLE public.profiles RENAME COLUMN signup_ip TO registro_ip;
ALTER TABLE public.profiles RENAME COLUMN signup_device TO registro_dispositivo;

-- Restaurar columna nombre
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nombre TEXT DEFAULT NULL;

-- 4. Revertir orders (is_redeemed -> canjeado, receipt_url -> comprobante_url)
ALTER TABLE public.orders RENAME COLUMN is_redeemed TO canjeado;
ALTER TABLE public.orders RENAME COLUMN receipt_url TO comprobante_url;

DROP INDEX IF EXISTS public.idx_orders_is_redeemed;
CREATE INDEX IF NOT EXISTS idx_orders_canjeado ON public.orders (canjeado);

-- 5. Revertir nequi_email_logs (amount -> monto, status -> estado, etc.)
ALTER TABLE public.nequi_email_logs RENAME COLUMN amount TO monto;
ALTER TABLE public.nequi_email_logs RENAME COLUMN status TO estado;
ALTER TABLE public.nequi_email_logs RENAME COLUMN email_date TO fecha_email;
ALTER TABLE public.nequi_email_logs RENAME COLUMN payer TO pagador;
ALTER TABLE public.nequi_email_logs RENAME COLUMN bank TO banco;
ALTER TABLE public.nequi_email_logs RENAME COLUMN reference TO referencia;
ALTER TABLE public.nequi_email_logs RENAME COLUMN transaction_number TO numero_transaccion;
ALTER TABLE public.nequi_email_logs RENAME COLUMN payment_method TO metodo_pago;

DROP INDEX IF EXISTS public.idx_nequi_logs_date;
DROP INDEX IF EXISTS public.idx_nequi_logs_amount;

CREATE INDEX IF NOT EXISTS idx_nequi_logs_fecha ON public.nequi_email_logs (fecha_email DESC);
CREATE INDEX IF NOT EXISTS idx_nequi_logs_monto ON public.nequi_email_logs (monto);

-- 6. Revertir validate_disposable_email
DROP TRIGGER IF EXISTS trg_validate_disposable_email ON auth.users;
DROP FUNCTION IF EXISTS public.validate_disposable_email();

CREATE OR REPLACE FUNCTION public.validar_correo_desechable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    dominio_correo TEXT;
    esta_bloqueado BOOLEAN := FALSE;
    url_api TEXT;
    respuesta_api RECORD;
    cuerpo_json JSONB;
    es_temporal_api BOOLEAN;
BEGIN
    dominio_correo := LOWER(split_part(NEW.email, '@', 2));

    IF dominio_correo LIKE '%yopmail%' 
       OR dominio_correo LIKE '%mailinator%' 
       OR dominio_correo LIKE '%tempmail%'
       OR dominio_correo LIKE '%guerrillamail%'
       OR dominio_correo LIKE '%10minutemail%'
       OR dominio_correo LIKE '%dispostable%'
    THEN
        esta_bloqueado := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 
            FROM public.blocked_domains 
            WHERE domain = dominio_correo
        ) INTO esta_bloqueado;
        
        IF NOT esta_bloqueado THEN
            url_api := 'https://api.facha.dev/v1/temporary-email/' || dominio_correo;
            
            BEGIN
                SELECT * FROM http_get(url_api) INTO respuesta_api;
                
                IF respuesta_api.status = 200 THEN
                    cuerpo_json := respuesta_api.content::JSONB;
                    es_temporal_api := (cuerpo_json->>'temporary')::BOOLEAN;
                    
                    IF es_temporal_api THEN
                        esta_bloqueado := TRUE;
                        
                        INSERT INTO public.blocked_domains (domain) 
                        VALUES (dominio_correo) 
                        ON CONFLICT (domain) DO NOTHING;
                    END IF;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;
    END IF;

    IF esta_bloqueado THEN
        RAISE EXCEPTION 'No se permiten registros con correos temporales o desechables.'
            USING DETAIL = 'correo_desechable_bloqueado';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER disparador_antes_crear_usuario
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.validar_correo_desechable();

-- 7. Revertir actualizar_perfil_login
DROP TRIGGER IF EXISTS trg_update_profile_login ON auth.sessions;
DROP FUNCTION IF EXISTS public.update_profile_login();

CREATE OR REPLACE FUNCTION public.actualizar_perfil_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET 
        ultimo_acceso_ip = HOST(NEW.ip),
        ultimo_acceso_dispositivo = NEW.user_agent,
        updated_at = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER disparador_actualizar_perfil_login
AFTER INSERT OR UPDATE ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_perfil_login();

-- 8. Revertir validate_activation_slots_limit
DROP TRIGGER IF EXISTS trg_validate_activation_slots_limit ON public.order_activations;
DROP FUNCTION IF EXISTS public.validate_activation_slots_limit();

CREATE OR REPLACE FUNCTION public.validar_limite_activacion_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quantity INTEGER;
  v_current_slots INTEGER;
BEGIN
  SELECT quantity INTO v_quantity
  FROM public.orders
  WHERE id = NEW.order_id;

  SELECT count(*)::integer INTO v_current_slots
  FROM public.order_activations
  WHERE order_id = NEW.order_id;

  IF v_current_slots >= coalesce(v_quantity, 1) THEN
    RAISE EXCEPTION 'Límite de activaciones alcanzado para esta orden.'
      USING DETAIL = 'limite_activaciones_excedido';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_validar_limite_activacion_slots
BEFORE INSERT ON public.order_activations
FOR EACH ROW
EXECUTE FUNCTION public.validar_limite_activacion_slots();

-- 9. Revertir sync_activations_to_order
DROP TRIGGER IF EXISTS trg_sync_activations ON public.order_activations;
DROP FUNCTION IF EXISTS public.sync_activations_to_order();

CREATE OR REPLACE FUNCTION public.sincronizar_activaciones_a_orden()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_activations JSONB;
  v_quantity INTEGER;
  v_is_fully_redeemed BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'first_name', first_name,
      'last_name', last_name,
      'email', email,
      'activated_at', activated_at
    )
  ) INTO v_activations
  FROM public.order_activations
  WHERE order_id = v_order_id;

  IF v_activations IS NULL THEN
    v_activations := '[]'::jsonb;
  END IF;

  SELECT quantity INTO v_quantity
  FROM public.orders
  WHERE id = v_order_id;

  IF jsonb_array_length(v_activations) >= coalesce(v_quantity, 1) THEN
    v_is_fully_redeemed := TRUE;
  ELSE
    v_is_fully_redeemed := FALSE;
  END IF;

  UPDATE public.orders
  SET activation_details = v_activations,
      canjeado = v_is_fully_redeemed,
      activated_at = CASE WHEN v_is_fully_redeemed THEN now() ELSE NULL END
  WHERE id = v_order_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trigger_sincronizar_activaciones
AFTER INSERT OR UPDATE OR DELETE ON public.order_activations
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_activaciones_a_orden();

-- 10. Revertir notify_approved_money_order_trigger
DROP TRIGGER IF EXISTS trg_notify_approved_money_order ON public.orders;
DROP FUNCTION IF EXISTS public.notify_approved_money_order_trigger();

CREATE OR REPLACE FUNCTION public.funcion_disparadora_notificar_orden_aprobada_dinero()
RETURNS TRIGGER AS $$
DECLARE
  v_webhook_url TEXT;
  v_api_key TEXT;
  v_product_title TEXT;
BEGIN
  SELECT value INTO v_webhook_url
  FROM public.system_settings
  WHERE key = 'n8n_webhook_url';

  IF v_webhook_url IS NULL THEN
    v_webhook_url := 'https://ventusn8n.smartcontacts.cloud/webhook-test/8f448518-ab20-4aa7-a024-446ebb6e9c32';
  END IF;

  SELECT value INTO v_api_key
  FROM public.system_settings
  WHERE key = 'n8n_api_key';

  IF v_api_key IS NULL THEN
    v_api_key := 'ventus-secret-n8n-key-98765';
  END IF;

  SELECT title INTO v_product_title
  FROM public.products
  WHERE id = NEW.product_id;

  PERFORM net.http_post(
    url := v_webhook_url,
    body := jsonb_build_object(
      'order_id', NEW.id,
      'user_id', NEW.user_id,
      'product_id', NEW.product_id,
      'product_title', coalesce(v_product_title, 'Producto'),
      'payment_type', NEW.payment_type,
      'amount_cop', NEW.amount_cop,
      'quantity', NEW.quantity,
      'plan_id', NEW.plan_id,
      'reference_note', NEW.reference_note,
      'created_at', NEW.created_at,
      'approved_at', NEW.approved_at
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', v_api_key
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_approved_money_order
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'approved' AND NEW.payment_type = 'money' AND NEW.reference_note IS NOT NULL)
EXECUTE FUNCTION public.funcion_disparadora_notificar_orden_aprobada_dinero();

-- 11. Revertir handle_assign_email_from_pool_trigger
DROP TRIGGER IF EXISTS trg_assign_email_from_pool ON public.orders;
DROP FUNCTION IF EXISTS public.handle_assign_email_from_pool_trigger();

CREATE OR REPLACE FUNCTION public.funcion_disparadora_asignar_correo_por_orden()
RETURNS TRIGGER AS $$
DECLARE
  v_correo_id UUID;
  v_email TEXT;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved')) THEN
     
    IF NEW.plan_id IS NOT NULL THEN
      SELECT id, email INTO v_correo_id, v_email
      FROM public.pool_correos
      WHERE product_id = NEW.product_id AND plan_id = NEW.plan_id AND estado = 'sin_asignar'
      ORDER BY fecha_creacion ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_correo_id IS NOT NULL THEN
        UPDATE public.pool_correos
        SET estado = 'asignado',
            usuario_asignado = NEW.user_id
        WHERE id = v_correo_id;

        NEW.delivered_credentials := 'Tu cuenta asignada: ' || v_email;
      ELSE
        SELECT id, email INTO v_correo_id, v_email
        FROM public.pool_correos
        WHERE product_id = NEW.product_id AND plan_id IS NULL AND estado = 'sin_asignar'
        ORDER BY fecha_creacion ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_correo_id IS NOT NULL THEN
          UPDATE public.pool_correos
          SET estado = 'asignado',
              usuario_asignado = NEW.user_id
          WHERE id = v_correo_id;

          NEW.delivered_credentials := 'Tu cuenta asignada: ' || v_email;
        ELSE
          NEW.admin_note := coalesce(NEW.admin_note, '') || ' [ADVERTENCIA: No se encontraron correos disponibles en el pool para este plan]';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER disparador_asignar_correo_por_orden
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.funcion_disparadora_asignar_correo_por_orden();

-- 12. Revertir is_current_user_invited()
CREATE OR REPLACE FUNCTION public.is_current_user_invited()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') THEN
    RETURN TRUE;
  END IF;

  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 
    FROM public.invitados 
    WHERE lower(email) = lower(v_email)
  ) THEN
    RETURN TRUE;
  END IF;

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

-- 13. Recrear view products_with_plans
CREATE OR REPLACE VIEW public.products_with_plans AS
SELECT 
  p.id,
  p.slug,
  p.title,
  p.description,
  p.short_description,
  p.price_cop,
  p.points_price,
  p.thumbnail_url,
  p.file_path,
  p.credentials,
  p.is_active,
  p.accordions,
  p.visibility,
  p.payment_modes,
  p.category_id,
  p.stock,
  p.created_at,
  p.updated_at,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pp.id,
          'name', pp.name,
          'price_cop', pp.price_cop,
          'points_price', pp.points_price,
          'short_description', pp.short_description,
          'description', pp.description,
          'require_new_account', pp.require_new_account,
          'bulk_pricing', pp.bulk_pricing,
          'accordions', pp.accordions
        )
      )
      FROM public.pricing_plans pp
      WHERE pp.product_id = p.id
    ),
    '[]'::jsonb
  ) AS plans
FROM public.products p;

COMMIT;
