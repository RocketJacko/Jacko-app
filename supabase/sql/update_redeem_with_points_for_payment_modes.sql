-- =============================================================================
-- MIGRACIÓN: ACTUALIZAR CANJE POR PUNTOS PARA MODO DE PAGO CONFIGURADO
-- Ejecutar en el Editor SQL de Supabase para soportar la Fase 5
-- =============================================================================

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

  select title, points_price, is_active, credentials, file_path, stock, plans, visibility, payment_modes
    into v_title, v_points_price, v_active, v_credentials, v_file_path, v_stock, v_plans, v_visibility, v_payment_modes
  from public.products where id = p_product_id;

  if not found or not v_active then
    return query select false, null::uuid, 'Producto no disponible o inactivo'::text;
    return;
  end if;

  -- 1. CONDICIÓN: Si el producto es exclusivo para invitados, el usuario debe tener la etiqueta de invitado.
  -- Si el producto es general (público), cualquier usuario autenticado con puntos puede canjearlo.
  if (v_visibility = 'invited_only' or v_visibility = 'invited') and not public.is_current_user_invited() then
    return query select false, null::uuid, 'El usuario debe tener la etiqueta de invitado para realizar este canje.'::text;
    return;
  end if;

  -- 2. CONDICIÓN: El producto debe admitir pagos con puntos (payment_modes in ('points', 'both'))
  -- Por compatibilidad con registros legacy sin valor de modo de pago, se verifica la visibilidad si es NULL.
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

  -- Resolver precio según el plan de precios, si se especificó p_plan_id
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

  -- Generar UUID de la orden por adelantado para usarlo en la referencia
  v_order_id := gen_random_uuid();

  -- Insertar la orden (con plan_id, estado aprobado y referencia de transacción generada)
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

  -- Invocar la Edge Function de manera asíncrona usando pg_net (sin bloquear la transacción)
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
