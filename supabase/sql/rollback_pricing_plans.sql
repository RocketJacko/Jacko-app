-- =============================================================================
-- ROLLBACK: DESHACER NORMALIZACIÓN DE PLANES DE PRECIOS
-- Ejecutar en el Editor SQL de Supabase para revertir cambios en caso de falla.
-- =============================================================================

BEGIN;

-- 1. Eliminar la vista
DROP VIEW IF EXISTS public.products_with_plans;

-- 2. Eliminar llaves foráneas creadas
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS fk_orders_plan;
ALTER TABLE public.pool_correos DROP CONSTRAINT IF EXISTS fk_pool_correos_plan;

-- 3. Reconstruir los datos en la columna legacy products.plans
--    Solo si la tabla pricing_plans aún existe
IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pricing_plans') THEN
  UPDATE public.products p
  SET plans = COALESCE(
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
  );
END IF;

-- 4. Eliminar la tabla pricing_plans
DROP TABLE IF EXISTS public.pricing_plans;

-- 5. Eliminar la columna product_id de pool_correos
ALTER TABLE public.pool_correos DROP COLUMN IF EXISTS product_id;

-- 6. Revertir la función redeem_with_points a la versión legacy (que leía JSONB)
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
  v_plans JSONB;
  v_title TEXT;
  v_total_points_needed INTEGER;
  v_selected_plan_name TEXT;
  v_order_id UUID;
  v_delivered_credentials TEXT;
  v_jwt TEXT;
  v_visibility TEXT;
  v_payment_modes TEXT;
BEGIN
  v_user_id := auth.uid();
  if v_user_id is null then
    return query select false, null::uuid, 'No autenticado'::text;
    return;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    return query select false, null::uuid, 'Cantidad inválida'::text;
    return;
  end if;

  select title, points_price, is_active, credentials, file_path, stock, plans, visibility, payment_modes
    into v_title, v_points_price, v_active, v_credentials, v_file_path, v_stock, v_plans, v_visibility, v_payment_modes
  from public.products where id = p_product_id;

  if not found or not v_active then
    return query select false, null::uuid, 'Producto no disponible o inactivo'::text;
    return;
  end if;

  if (v_visibility = 'invited_only' or v_visibility = 'invited') and not public.is_current_user_invited() then
    return query select false, null::uuid, 'El usuario debe tener la etiqueta de invitado para realizar este canje.'::text;
    return;
  end if;

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

  v_selected_plan_name := null;
  if p_plan_id is not null and p_plan_id <> '' and v_plans is not null then
    declare
      v_plan jsonb;
    begin
      for v_plan in select jsonb_array_elements(v_plans) loop
        if (v_plan->>'id') = p_plan_id then
          v_points_price := (v_plan->>'points_price')::integer;
          v_selected_plan_name := v_plan->>'name';
          exit;
         end if;
      end loop;
    end;
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

  update public.profiles
    set points = points - v_total_points_needed, updated_at = now()
    where id = v_user_id;

  if v_stock is not null then
    update public.products set stock = stock - p_quantity where id = p_product_id;
  end if;

  v_delivered_credentials := v_credentials;
  v_order_id := gen_random_uuid();

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

  insert into public.point_transactions (user_id, type, points, reference_id, description)
  values (
    v_user_id, 
    'redeem', 
    -v_total_points_needed, 
    v_order_id, 
    'Canje de ' || p_quantity || 'x ' || v_title || case when v_selected_plan_name is not null then ' (' || v_selected_plan_name || ')' else '' end
  );

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

-- 7. Revertir el trigger de asignación de correos a la lógica general sin product_id
CREATE OR REPLACE FUNCTION funcion_disparadora_asignar_correo_por_orden()
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
      WHERE plan_id = NEW.plan_id AND estado = 'sin_asignar'
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
        WHERE plan_id IS NULL AND estado = 'sin_asignar'
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
$$ LANGUAGE plpgsql;

COMMIT;
