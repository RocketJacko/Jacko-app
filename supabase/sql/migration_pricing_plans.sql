-- =============================================================================
-- MIGRACIÓN: NORMALIZACIÓN DE PLANES DE PRECIOS A TABLA RELACIONAL
-- Ejecutar en el Editor SQL de Supabase (Envuelto en Transacción Atómica)
-- =============================================================================

BEGIN;

-- 1. Crear la tabla pricing_plans
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  id TEXT NOT NULL, -- Identificador semántico (ej: 'mensual', 'pago-unico')
  name TEXT NOT NULL,
  price_cop INTEGER NOT NULL,
  points_price INTEGER,
  short_description TEXT,
  description TEXT,
  require_new_account BOOLEAN DEFAULT false NOT NULL,
  bulk_pricing JSONB,
  accordions JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_pricing_plans PRIMARY KEY (product_id, id)
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para pricing_plans
DROP POLICY IF EXISTS pricing_plans_select_public ON public.pricing_plans;
CREATE POLICY pricing_plans_select_public ON public.pricing_plans
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS pricing_plans_write_admin ON public.pricing_plans;
CREATE POLICY pricing_plans_write_admin ON public.pricing_plans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 2. Migrar los planes existentes desde el JSONB products.plans
INSERT INTO public.pricing_plans (
  product_id, id, name, price_cop, points_price, short_description, description, require_new_account, bulk_pricing, accordions
)
SELECT 
  id AS product_id,
  (plan->>'id')::text AS id,
  (plan->>'name')::text AS name,
  COALESCE((plan->>'price_cop')::integer, 0) AS price_cop,
  (plan->>'points_price')::integer AS points_price,
  (plan->>'short_description')::text AS short_description,
  (plan->>'description')::text AS description,
  COALESCE((plan->>'require_new_account')::boolean, false) AS require_new_account,
  (plan->'bulk_pricing')::jsonb AS bulk_pricing,
  (plan->'accordions')::jsonb AS accordions
FROM public.products,
LATERAL jsonb_array_elements(plans) AS plan
ON CONFLICT (product_id, id) DO NOTHING;

-- 3. Modificar pool_correos para enlazar de forma atómica con product_id
ALTER TABLE public.pool_correos ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;

-- Poblar product_id en base a las relaciones de plan_id existentes
UPDATE public.pool_correos pc
SET product_id = pp.product_id
FROM public.pricing_plans pp
WHERE pc.plan_id = pp.id;

-- 4. Establecer constraints de llave foránea compuestas en orders y pool_correos
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS fk_orders_plan;
ALTER TABLE public.orders 
  ADD CONSTRAINT fk_orders_plan 
  FOREIGN KEY (product_id, plan_id) 
  REFERENCES public.pricing_plans(product_id, id) 
  ON DELETE SET NULL;

ALTER TABLE public.pool_correos DROP CONSTRAINT IF EXISTS fk_pool_correos_plan;
ALTER TABLE public.pool_correos 
  ADD CONSTRAINT fk_pool_correos_plan 
  FOREIGN KEY (product_id, plan_id) 
  REFERENCES public.pricing_plans(product_id, id) 
  ON DELETE SET NULL;

-- 5. Crear la Vista Unificada para emular la columna plans como JSONB
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

-- 6. Actualizar la función redeem_with_points
CREATE OR REPLACE FUNCTION public.redeem_with_points(
  p_product_id UUID,
  p_quantity INTEGER DEFAULT 1,
  p_plan_id TEXT DEFAULT NULL::TEXT
)
RETURNS TABLE (success BOOLEAN, order_id UUID, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_user_points INTEGER;
  v_points_price INTEGER;
  v_active BOOLEAN;
  v_credentials TEXT;
  v_file_path TEXT;
  v_stock INTEGER;
  v_title TEXT;
  v_total_points_needed INTEGER;
  v_selected_plan_name TEXT;
  v_order_id UUID;
  v_delivered_credentials TEXT;
  v_jwt TEXT;
  v_visibility TEXT;
  v_payment_modes TEXT;
BEGIN
  -- Verificar sesión
  v_user_id := auth.uid();
  if v_user_id is null then
    return query select false, null::uuid, 'No autenticado'::text;
    return;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    return query select false, null::uuid, 'Cantidad inválida'::text;
    return;
  end if;

  select title, points_price, is_active, credentials, file_path, stock, visibility, payment_modes
    into v_title, v_points_price, v_active, v_credentials, v_file_path, v_stock, v_visibility, v_payment_modes
  from public.products where id = p_product_id;

  if not found or not v_active then
    return query select false, null::uuid, 'Producto no disponible o inactivo'::text;
    return;
  end if;

  -- 1. CONDICIÓN: Si el producto es exclusivo para invitados, el usuario debe tener la etiqueta de invitado.
  if (v_visibility = 'invited_only' or v_visibility = 'invited') and not public.is_current_user_invited() then
    return query select false, null::uuid, 'El usuario debe tener la etiqueta de invitado para realizar este canje.'::text;
    return;
  end if;

  -- 2. CONDICIÓN: El producto debe admitir pagos con puntos
  if v_payment_modes is not null then
    if v_payment_modes <> 'points' and v_payment_modes <> 'both' then
      return query select false, null::uuid, 'Este producto no admite canjes por puntos.'::text;
      return;
    end if;
  else
    if v_visibility is null or (v_visibility <> 'invited_only' and v_visibility <> 'invited') then
      return query select false, null::uuid, 'Este producto solo puede ser adquirido con dinero real.'::text;
      return;
    end if;
  end if;

  -- Resolver precio según el plan de precios relacional, si se especificó p_plan_id
  v_selected_plan_name := null;
  if p_plan_id is not null and p_plan_id <> '' then
    select points_price, name
      into v_points_price, v_selected_plan_name
    from public.pricing_plans
    where product_id = p_product_id and id = p_plan_id;
    
    if not found then
      return query select false, null::uuid, 'El plan especificado no existe para este producto.'::text;
      return;
    end if;
  end if;

  if v_points_price is null then
    return query select false, null::uuid, 'Este producto o plan no está disponible para canje por puntos.'::text;
    return;
  end if;

  v_total_points_needed := v_points_price * p_quantity;

  if v_stock is not null and v_stock < p_quantity then
    return query select false, null::uuid, 'Stock insuficiente'::text;
    return;
  end if;

  select points into v_user_points from public.profiles where id = v_user_id;
  if v_user_points < v_total_points_needed then
    return query select false, null::uuid, 'Puntos insuficientes'::text;
    return;
  end if;

  -- Descontar puntos del perfil
  update public.profiles
    set points = points - v_total_points_needed, updated_at = now()
    where id = v_user_id;

  -- Descontar stock del producto
  if v_stock is not null then
    update public.products set stock = stock - p_quantity where id = p_product_id;
  end if;

  -- Credenciales por defecto
  v_delivered_credentials := v_credentials;

  -- Generar UUID de la orden por adelantado
  v_order_id := gen_random_uuid();

  -- Insertar la orden
  insert into public.orders (
    id, user_id, product_id, payment_type, amount_cop, points_used,
    status, delivered_credentials, delivered_file_path, approved_at,
    quantity, reference_note, plan_id
  ) values (
    v_order_id, v_user_id, p_product_id, 'points', 0, v_total_points_needed,
    'approved', v_delivered_credentials, v_file_path, now(),
    p_quantity, coalesce('Canje Plan: ' || v_selected_plan_name, 'Canje: ' || v_title) || ' - PTS-' || upper(substring(v_order_id::text, 1, 8)),
    p_plan_id
  );

  -- Registrar la transacción de puntos
  insert into public.point_transactions (user_id, type, points, reference_id, description)
  values (
    v_user_id, 
    'redeem', 
    -v_total_points_needed, 
    v_order_id, 
    'Canje de ' || p_quantity || 'x ' || v_title || case when v_selected_plan_name is not null then ' (' || v_selected_plan_name || ')' else '' end
  );

  -- Invocar la Edge Function de manera asíncrona usando pg_net
  v_jwt := current_setting('request.headers', true)::json->>'authorization';
  if v_jwt is not null then
    perform net.http_post(
      url := 'https://plybwnfnmvshroaottby.supabase.co/functions/v1/assign-pool-email',
      body := jsonb_build_object(
        'order_id', v_order_id,
        'user_id', v_user_id,
        'plan_id', p_plan_id
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', v_jwt
      )
    );
  end if;

  return query select true, v_order_id, 'OK'::text;
END;
$$;

-- 7. Actualizar el trigger de asignación de correos
CREATE OR REPLACE FUNCTION funcion_disparadora_asignar_correo_por_orden()
RETURNS TRIGGER AS $$
DECLARE
  v_correo_id UUID;
  v_email TEXT;
BEGIN
  -- Actúa cuando el estado es 'approved'
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved')) THEN
     
    -- Solo si la orden tiene un plan_id
    IF NEW.plan_id IS NOT NULL THEN
      -- Buscar y bloquear un correo libre para ese product_id y plan_id
      SELECT id, email INTO v_correo_id, v_email
      FROM public.pool_correos
      WHERE product_id = NEW.product_id AND plan_id = NEW.plan_id AND estado = 'sin_asignar'
      ORDER BY fecha_creacion ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_correo_id IS NOT NULL THEN
        -- Marcar el correo como asignado
        UPDATE public.pool_correos
        SET estado = 'asignado',
            usuario_asignado = NEW.user_id
        WHERE id = v_correo_id;

        -- Guardar el email en las credenciales entregadas de la orden
        NEW.delivered_credentials := 'Tu cuenta asignada: ' || v_email;
      ELSE
        -- Si no se encontró un correo específico para el plan, intentar con uno general (plan_id IS NULL) de ese producto
        SELECT id, email INTO v_correo_id, v_email
        FROM public.pool_correos
        WHERE product_id = NEW.product_id AND plan_id IS NULL AND estado = 'sin_asignar'
        ORDER BY fecha_creacion ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_correo_id IS NOT NULL THEN
          -- Marcar el correo como asignado
          UPDATE public.pool_correos
          SET estado = 'asignado',
              usuario_asignado = NEW.user_id
          WHERE id = v_correo_id;

          NEW.delivered_credentials := 'Tu cuenta asignada: ' || v_email;
        ELSE
          -- Si no hay correos en absoluto, añadir advertencia a la nota administrativa
          NEW.admin_note := coalesce(NEW.admin_note, '') || ' [ADVERTENCIA: No se encontraron correos disponibles en el pool para este plan]';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
