-- =============================================================================
-- MIGRACIÓN: REFUERZO DE SEGURIDAD EN EL POOL DE CORREOS Y FUNCIONES CRÍTICAS
-- Ejecutar en el Editor SQL de Supabase para evitar ejecuciones no autorizadas (RPC)
-- =============================================================================

-- 1. Actualizar la función assign_pool_email_to_order_v2 con validaciones estrictas
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
  
  -- Variables de validación
  v_order_user_id UUID;
  v_order_status TEXT;
  v_payment_type TEXT;
  v_delivered_credentials TEXT;
  v_product_id UUID;
  v_order_plan_id TEXT;
BEGIN
  -- A. Validar existencia de la orden y extraer su estado/detalles
  SELECT user_id, status, payment_type, delivered_credentials, quantity, product_id, plan_id
  INTO v_order_user_id, v_order_status, v_payment_type, v_delivered_credentials, v_quantity, v_product_id, v_order_plan_id
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada';
  END IF;

  -- B. Aplicar validaciones de seguridad según el contexto del ejecutor
  -- Si no es un super_admin, admin o la clave del sistema (service_role), aplicar restricciones de usuario
  IF NOT (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR auth.jwt() ->> 'role' = 'service_role'
  ) THEN
    -- El usuario autenticado regular sólo puede actuar sobre su propia orden
    IF v_order_user_id <> p_user_id OR p_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Acceso no autorizado: la orden no pertenece al usuario autenticado';
    END IF;

    -- Un usuario normal no puede auto-asignar para compras por dinero (esas las procesa el trigger al verificar pago)
    IF v_payment_type <> 'points' THEN
      RAISE EXCEPTION 'Operación no permitida: sólo se puede auto-asignar en canje de puntos';
    END IF;

    -- La orden debe estar aprobada
    IF v_order_status <> 'approved' AND v_order_status <> 'procesando' THEN
      RAISE EXCEPTION 'Operación no permitida: la orden debe estar aprobada';
    END IF;
  END IF;

  -- C. Evitar doble asignación si se reintenta el webhook/llamada
  IF v_delivered_credentials IS NOT NULL AND v_delivered_credentials LIKE 'Tu cuenta asignada:%' THEN
    RETURN TRUE;
  END IF;

  IF v_quantity is null or v_quantity <= 0 then
    v_quantity := 1;
  END IF;

  -- Use p_plan_id if provided, fallback to v_order_plan_id
  IF p_plan_id IS NULL OR p_plan_id = '' THEN
    p_plan_id := v_order_plan_id;
  END IF;

  FOR i IN 1..v_quantity LOOP
    v_correo_id := null;
    v_email := null;

    -- Select email using unified priority logic
    SELECT id, email INTO v_correo_id, v_email
    FROM public.email_pool
    WHERE status = 'unassigned'
      AND (product_id = v_product_id OR product_id IS NULL)
      AND (
        (p_plan_id IS NOT NULL AND p_plan_id <> '' AND (plan_id = p_plan_id OR plan_id IS NULL))
        OR
        ((p_plan_id IS NULL OR p_plan_id = '') AND plan_id IS NULL)
      )
    ORDER BY
      (CASE WHEN product_id = v_product_id THEN 1 ELSE 2 END) ASC,
      (CASE WHEN plan_id = p_plan_id THEN 1 ELSE 2 END) ASC,
      created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- Asignar el correo encontrado
    IF v_correo_id IS NOT NULL THEN
      UPDATE public.email_pool
      SET status = 'assigned',
          assigned_user_id = p_user_id
      WHERE id = v_correo_id;

      v_emails_list := array_append(v_emails_list, v_email);
    END IF;
  END LOOP;

  IF array_length(v_emails_list, 1) > 0 THEN
    -- If successful, clear the warning from admin_note if it was added by the trigger
    UPDATE public.orders
    SET delivered_credentials = 'Tu cuenta asignada: ' || array_to_string(v_emails_list, ', '),
        is_redeemed = true,
        status = 'procesado',
        admin_note = CASE 
          WHEN admin_note LIKE '%[ADVERTENCIA: No se encontraron%' 
          THEN NULLIF(trim(REPLACE(admin_note, ' [ADVERTENCIA: No se encontraron correos disponibles en el pool para este plan]', '')), '')
          ELSE admin_note
        END
    WHERE id = p_order_id;
    
    RETURN TRUE;
  ELSE
    -- If it fails, append warning
    UPDATE public.orders
    SET admin_note = coalesce(admin_note, '') || ' [ADVERTENCIA: No se encontraron correos disponibles en el pool para esta orden]'
    WHERE id = p_order_id;
    
    RETURN FALSE;
  END IF;
END;
$$;

-- 2. Restringir privilegios de ejecución de assign_pool_email_to_order_v2
-- Revocar de PUBLIC y de roles cliente de Supabase (anon, authenticated)
REVOKE EXECUTE ON FUNCTION public.assign_pool_email_to_order_v2(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Otorgar exclusivamente a service_role (usado por Edge Functions) y postgres
GRANT EXECUTE ON FUNCTION public.assign_pool_email_to_order_v2(UUID, UUID, TEXT) TO service_role;

-- 3. Restringir privilegios de ejecución de redeem_with_points
-- Revocar de PUBLIC y anon
REVOKE EXECUTE ON FUNCTION public.redeem_with_points(UUID, INTEGER, TEXT) FROM PUBLIC, anon;

-- Otorgar a usuarios registrados (authenticated) y service_role
GRANT EXECUTE ON FUNCTION public.redeem_with_points(UUID, INTEGER, TEXT) TO authenticated, service_role;
