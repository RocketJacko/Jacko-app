-- =============================================================================
-- MIGRACIÓN: CANJE SEGURO Y ASIGNACIÓN DE POOL DE CORREOS
-- Ejecutar en el Editor SQL de Supabase
-- =============================================================================

-- 1. Actualizar la función de canje por puntos con validación de invitado y llamada a la Edge Function
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
BEGIN
  -- Verificar sesión
  v_user_id := auth.uid();
  if v_user_id is null then
    return query select false, null::uuid, 'No autenticado'::text;
    return;
  end if;

  -- 1. CONDICIÓN: El usuario debe tener la etiqueta/estado de invitado
  if not public.is_current_user_invited() then
    return query select false, null::uuid, 'El usuario debe tener la etiqueta de invitado para realizar este canje.'::text;
    return;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    return query select false, null::uuid, 'Cantidad inválida'::text;
    return;
  end if;

  select title, points_price, is_active, credentials, file_path, stock, plans, visibility
    into v_title, v_points_price, v_active, v_credentials, v_file_path, v_stock, v_plans, v_visibility
  from public.products where id = p_product_id;

  if not found or not v_active then
    return query select false, null::uuid, 'Producto no disponible o inactivo'::text;
    return;
  end if;

  -- 1.1 CONDICIÓN: El producto debe ser de visibilidad 'invited_only' o 'invited' para poder ser canjeado por puntos
  if v_visibility is null or (v_visibility <> 'invited_only' and v_visibility <> 'invited') then
    return query select false, null::uuid, 'Este producto solo puede ser adquirido con dinero real.'::text;
    return;
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

  -- Insertar la orden (con plan_id y estado aprobado)
  insert into public.orders (
    user_id, product_id, payment_type, amount_cop, points_used,
    status, delivered_credentials, delivered_file_path, approved_at,
    quantity, reference_note, plan_id
  ) values (
    v_user_id, p_product_id, 'points', 0, v_total_points_needed,
    'approved', v_delivered_credentials, v_file_path, now(),
    p_quantity, case when v_selected_plan_name is not null then 'Canje Plan: ' || v_selected_plan_name else null end,
    p_plan_id
  ) returning id into v_order_id;

  -- Registrar la transacción de puntos
  insert into public.point_transactions (user_id, type, points, reference_id, description)
  values (
    v_user_id, 
    'redeem', 
    -v_total_points_needed, 
    v_order_id, 
    'Canje de ' || p_quantity || 'x ' || v_title || case when v_selected_plan_name is not null then ' (' || v_selected_plan_name || ')' else '' end
  );

  -- 2. Invocar la Edge Function de manera asíncrona usando pg_net (sin bloquear la transacción)
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
end;
$$;

-- 2. Crear función transaccional de asignación de correos llamada por la Edge Function con service_role
CREATE OR REPLACE FUNCTION public.assign_pool_email_to_order_v2(
  p_order_id UUID,
  p_user_id UUID,
  p_plan_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_correo_id UUID;
  v_email TEXT;
  v_quantity INT;
  v_emails_list TEXT[] := ARRAY[]::TEXT[];
  i INT;
BEGIN
  -- Obtener la cantidad de la orden
  select quantity into v_quantity from public.orders where id = p_order_id;
  if v_quantity is null or v_quantity <= 0 then
    v_quantity := 1;
  end if;

  FOR i IN 1..v_quantity LOOP
    v_correo_id := null;
    v_email := null;

    -- A. Buscar y bloquear un correo libre para el plan_id especificado
    if p_plan_id is not null and p_plan_id <> '' then
      select id, email into v_correo_id, v_email
      from public.pool_correos
      where plan_id = p_plan_id and estado = 'sin_asignar'
      order by fecha_creacion asc
      limit 1
      for update skip locked;
    end if;

    -- B. Si no se encontró, buscar un correo general (plan_id IS NULL)
    if v_correo_id is null then
      select id, email into v_correo_id, v_email
      from public.pool_correos
      where plan_id is null and estado = 'sin_asignar'
      order by fecha_creacion asc
      limit 1
      for update skip locked;
    end if;

    -- C. Asignar el correo encontrado
    if v_correo_id is not null then
      -- Marcar el correo como asignado
      update public.pool_correos
      set estado = 'asignado',
          usuario_asignado = p_user_id
      where id = v_correo_id;

      v_emails_list := array_append(v_emails_list, v_email);
    end if;
  END LOOP;

  if array_length(v_emails_list, 1) > 0 then
    -- Actualizar la orden con las credenciales entregadas
    update public.orders
    set delivered_credentials = 'Tu cuenta asignada: ' || array_to_string(v_emails_list, ', ')
    where id = p_order_id;
    
    return true;
  else
    -- Si no hay correos en absoluto, añadir advertencia a la nota administrativa
    update public.orders
    set admin_note = coalesce(admin_note, '') || ' [ADVERTENCIA: No se encontraron correos disponibles en el pool para esta orden]'
    where id = p_order_id;
    
    return false;
  end if;
END;
$$;

-- 3. Modificar el disparador de órdenes para hacer bypass a las órdenes de tipo 'points'
CREATE OR REPLACE FUNCTION public.funcion_disparadora_asignar_correo_por_orden()
RETURNS TRIGGER AS $$
DECLARE
  v_correo_id UUID;
  v_email TEXT;
BEGIN
  -- BYPASS: Los canjes por puntos se delegan a la Edge Function de forma segura
  IF NEW.payment_type = 'points' THEN
    RETURN NEW;
  END IF;

  -- Lógica original de asignación automática para compras por dinero
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
