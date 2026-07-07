-- =============================================================================
-- MIGRACIÓN: ESTANDARIZACIÓN DE IDIOMA (ESPAÑOL A INGLÉS) EN LA BASE DE DATOS
-- Ejecutar en el Editor SQL de Supabase (Envuelto en Transacción Atómica)
-- =============================================================================

BEGIN;

-- 1. Renombrar la tabla invitados a invited_users
ALTER TABLE IF EXISTS public.invitados RENAME TO invited_users;

-- Actualizar políticas de RLS para invited_users
DROP POLICY IF EXISTS admin_all ON public.invited_users;
CREATE POLICY admin_all ON public.invited_users
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::text) OR public.has_role(auth.uid(), 'admin'::text));

DROP POLICY IF EXISTS user_read_own ON public.invited_users;
CREATE POLICY user_read_own ON public.invited_users
  FOR SELECT TO public
  USING (lower(email) = lower((auth.jwt() ->> 'email'::text)));

-- 2. Renombrar la tabla pool_correos a email_pool
ALTER TABLE IF EXISTS public.pool_correos RENAME TO email_pool;

-- Renombrar columnas en email_pool
ALTER TABLE IF EXISTS public.email_pool RENAME COLUMN fecha_creacion TO created_at;
ALTER TABLE IF EXISTS public.email_pool RENAME COLUMN estado TO status;
ALTER TABLE IF EXISTS public.email_pool RENAME COLUMN usuario_asignado TO assigned_user_id;

-- ELIMINAR EL CONSTRAINT DE CHECK ANTES DE ACTUALIZAR LOS VALORES
ALTER TABLE public.email_pool DROP CONSTRAINT IF EXISTS pool_correos_estado_check;

-- Ahora migrar los datos existentes
UPDATE public.email_pool SET status = 'unassigned' WHERE status = 'sin_asignar';
UPDATE public.email_pool SET status = 'assigned' WHERE status = 'asignado';
UPDATE public.email_pool SET status = 'blocked' WHERE status = 'bloqueado';

-- Recrear el constraint de check
ALTER TABLE public.email_pool ADD CONSTRAINT email_pool_status_check CHECK (status = ANY (ARRAY['unassigned'::text, 'assigned'::text, 'blocked'::text]));

-- Actualizar políticas de RLS para email_pool
DROP POLICY IF EXISTS "SuperAdmins full control on pool_correos" ON public.email_pool;
CREATE POLICY "SuperAdmins full control on email_pool"
  ON public.email_pool FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::text) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can read own assigned email" ON public.email_pool;
CREATE POLICY "Users can read own assigned email"
  ON public.email_pool FOR SELECT TO public
  USING (assigned_user_id = auth.uid());

-- Recrear índices de email_pool con nombres en inglés
DROP INDEX IF EXISTS public.idx_pool_correos_plan_estado;
DROP INDEX IF EXISTS public.idx_pool_correos_plan_estado_fecha;
DROP INDEX IF EXISTS public.idx_pool_correos_usuario_asignado;

CREATE INDEX IF NOT EXISTS idx_email_pool_plan_status ON public.email_pool (plan_id, status);
CREATE INDEX IF NOT EXISTS idx_email_pool_plan_status_date ON public.email_pool (plan_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_email_pool_assigned_user ON public.email_pool (assigned_user_id);

-- 3. Modificar la tabla profiles (Drop nombre, rename ciudad -> city, ultimo_acceso... -> last_login...)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS nombre;
ALTER TABLE public.profiles RENAME COLUMN ciudad TO city;
ALTER TABLE public.profiles RENAME COLUMN ultimo_acceso_ip TO last_login_ip;
ALTER TABLE public.profiles RENAME COLUMN ultimo_acceso_dispositivo TO last_login_device;
ALTER TABLE public.profiles RENAME COLUMN registro_ip TO signup_ip;
ALTER TABLE public.profiles RENAME COLUMN registro_dispositivo TO signup_device;

-- 4. Modificar la tabla orders (canjeado -> is_redeemed, comprobante_url -> receipt_url)
ALTER TABLE public.orders RENAME COLUMN canjeado TO is_redeemed;
ALTER TABLE public.orders RENAME COLUMN comprobante_url TO receipt_url;

DROP INDEX IF EXISTS public.idx_orders_canjeado;
CREATE INDEX IF NOT EXISTS idx_orders_is_redeemed ON public.orders (is_redeemed);

-- 5. Modificar la tabla nequi_email_logs (monto -> amount, estado -> status, etc.)
ALTER TABLE public.nequi_email_logs RENAME COLUMN monto TO amount;
ALTER TABLE public.nequi_email_logs RENAME COLUMN estado TO status;
ALTER TABLE public.nequi_email_logs RENAME COLUMN fecha_email TO email_date;
ALTER TABLE public.nequi_email_logs RENAME COLUMN pagador TO payer;
ALTER TABLE public.nequi_email_logs RENAME COLUMN banco TO bank;
ALTER TABLE public.nequi_email_logs RENAME COLUMN referencia TO reference;
ALTER TABLE public.nequi_email_logs RENAME COLUMN numero_transaccion TO transaction_number;
ALTER TABLE public.nequi_email_logs RENAME COLUMN metodo_pago TO payment_method;

-- Recrear índices de nequi_email_logs con nombres en inglés
DROP INDEX IF EXISTS public.idx_nequi_logs_fecha;
DROP INDEX IF EXISTS public.idx_nequi_logs_monto;

CREATE INDEX IF NOT EXISTS idx_nequi_logs_date ON public.nequi_email_logs (email_date DESC);
CREATE INDEX IF NOT EXISTS idx_nequi_logs_amount ON public.nequi_email_logs (amount);

-- 6. Actualizar trigger y función: validate_disposable_email
DROP TRIGGER IF EXISTS disparador_antes_crear_usuario ON auth.users;
DROP FUNCTION IF EXISTS public.validar_correo_desechable();

CREATE OR REPLACE FUNCTION public.validate_disposable_email()
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

CREATE TRIGGER trg_validate_disposable_email
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.validate_disposable_email();

-- 7. Actualizar trigger y función: update_profile_login
DROP TRIGGER IF EXISTS disparador_actualizar_perfil_login ON auth.sessions;
DROP FUNCTION IF EXISTS public.actualizar_perfil_login();

CREATE OR REPLACE FUNCTION public.update_profile_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET 
        last_login_ip = HOST(NEW.ip),
        last_login_device = NEW.user_agent,
        updated_at = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_profile_login
AFTER INSERT OR UPDATE ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_profile_login();

-- 8. Actualizar trigger y función: validate_activation_slots_limit
DROP TRIGGER IF EXISTS trigger_validar_limite_activacion_slots ON public.order_activations;
DROP FUNCTION IF EXISTS public.validar_limite_activacion_slots();

CREATE OR REPLACE FUNCTION public.validate_activation_slots_limit()
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

CREATE TRIGGER trg_validate_activation_slots_limit
BEFORE INSERT ON public.order_activations
FOR EACH ROW
EXECUTE FUNCTION public.validate_activation_slots_limit();

-- 9. Actualizar trigger y función: sync_activations_to_order
DROP TRIGGER IF EXISTS trigger_sincronizar_activaciones ON public.order_activations;
DROP FUNCTION IF EXISTS public.sincronizar_activaciones_a_orden();

CREATE OR REPLACE FUNCTION public.sync_activations_to_order()
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
      is_redeemed = v_is_fully_redeemed,
      activated_at = CASE WHEN v_is_fully_redeemed THEN now() ELSE NULL END
  WHERE id = v_order_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_activations
AFTER INSERT OR UPDATE OR DELETE ON public.order_activations
FOR EACH ROW
EXECUTE FUNCTION public.sync_activations_to_order();

-- 10. Actualizar trigger y función: notify_approved_money_order_trigger
DROP TRIGGER IF EXISTS trigger_notify_approved_money_order ON public.orders;
DROP FUNCTION IF EXISTS public.funcion_disparadora_notificar_orden_aprobada_dinero();

CREATE OR REPLACE FUNCTION public.notify_approved_money_order_trigger()
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

CREATE TRIGGER trg_notify_approved_money_order
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'approved' AND NEW.payment_type = 'money' AND NEW.reference_note IS NOT NULL)
EXECUTE FUNCTION public.notify_approved_money_order_trigger();

-- 11. Actualizar trigger y función: handle_assign_email_from_pool_trigger
DROP TRIGGER IF EXISTS disparador_asignar_correo_por_orden ON public.orders;
DROP FUNCTION IF EXISTS public.funcion_disparadora_asignar_correo_por_orden();

CREATE OR REPLACE FUNCTION public.handle_assign_email_from_pool_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_correo_id UUID;
  v_email TEXT;
  v_emails_list TEXT[] := ARRAY[]::TEXT[];
  v_quantity INT;
  i INT;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved')) THEN
     
    v_quantity := coalesce(NEW.quantity, 1);
    IF v_quantity <= 0 THEN
      v_quantity := 1;
    END IF;

    FOR i IN 1..v_quantity LOOP
      v_correo_id := null;
      v_email := null;

      -- Select email using priority logic
      SELECT id, email INTO v_correo_id, v_email
      FROM public.email_pool
      WHERE status = 'unassigned'
        AND (product_id = NEW.product_id OR product_id IS NULL)
        AND (
          (NEW.plan_id IS NOT NULL AND NEW.plan_id <> '' AND (plan_id = NEW.plan_id OR plan_id IS NULL))
          OR
          ((NEW.plan_id IS NULL OR NEW.plan_id = '') AND plan_id IS NULL)
        )
      ORDER BY
        (CASE WHEN product_id = NEW.product_id THEN 1 ELSE 2 END) ASC,
        (CASE WHEN plan_id = NEW.plan_id THEN 1 ELSE 2 END) ASC,
        created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_correo_id IS NOT NULL THEN
        UPDATE public.email_pool
        SET status = 'assigned',
            assigned_user_id = NEW.user_id
        WHERE id = v_correo_id;

        v_emails_list := array_append(v_emails_list, v_email);
      END IF;
    END LOOP;

    IF array_length(v_emails_list, 1) > 0 THEN
      NEW.delivered_credentials := 'Tu cuenta asignada: ' || array_to_string(v_emails_list, ', ');
      
      IF array_length(v_emails_list, 1) < v_quantity THEN
        NEW.admin_note := coalesce(NEW.admin_note, '') || ' [ADVERTENCIA: No se encontraron suficientes correos disponibles en el pool]';
      END IF;
    ELSE
      NEW.admin_note := coalesce(NEW.admin_note, '') || ' [ADVERTENCIA: No se encontraron correos disponibles en el pool para este plan]';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_assign_email_from_pool
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_assign_email_from_pool_trigger();

-- 12. Actualizar función is_current_user_invited() para usar invited_users
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
    FROM public.invited_users 
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

-- 13. Recrear el view products_with_plans para apuntar a la nueva estructura de email_pool
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
