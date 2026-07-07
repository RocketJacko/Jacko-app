-- =============================================================================
-- MIGRACIÓN: REFORZAR SEGURIDAD EN POLÍTICAS RLS Y FUNCIONES DE VALIDACIÓN
-- =============================================================================

-- 1. Eliminar política obsoleta de productos que permitía accesos sin verificar suscripciones
DROP POLICY IF EXISTS "products_select_authenticated" ON public.products;

-- 2. Actualizar política de actualización de perfiles (profiles_update_own)
-- Previene que los usuarios modifiquen su propio tier de suscripción o saldo de puntos.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    (auth.uid() = id)
    AND (NOT (points IS DISTINCT FROM (SELECT p.points FROM public.profiles p WHERE p.id = auth.uid())))
    AND (NOT (subscription_tier IS DISTINCT FROM (SELECT p.subscription_tier FROM public.profiles p WHERE p.id = auth.uid())))
  );

-- 3. Actualizar política de órdenes para actualizar comprobantes (orders_update_own_pending)
-- Solo permite actualizar órdenes si están actualmente en estado de espera y el nuevo estado sigue siendo pendiente.
DROP POLICY IF EXISTS "orders_update_own_pending" ON public.orders;

CREATE POLICY "orders_update_own_pending" ON public.orders
  FOR UPDATE
  TO public
  USING (
    auth.uid() = user_id 
    AND (status = 'pending'::text OR status = 'pending_nequi'::text)
  )
  WITH CHECK (
    auth.uid() = user_id 
    AND (status = 'pending'::text OR status = 'pending_nequi'::text)
  );

-- 4. Crear función disparadora para validar integridad de campos críticos en actualizaciones de órdenes
CREATE OR REPLACE FUNCTION public.validate_order_update_trigger()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si el rol de la base de datos es un rol del sistema o el usuario tiene rol admin/super_admin en la aplicación
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR public.has_role(auth.uid(), 'super_admin') 
     OR public.has_role(auth.uid(), 'admin') 
     OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Para usuarios normales:
  -- A. Validar que no modifiquen datos críticos de la orden
  IF NEW.id <> OLD.id OR
     NEW.user_id <> OLD.user_id OR
     NEW.product_id <> OLD.product_id OR
     NEW.payment_type <> OLD.payment_type OR
     NEW.amount_cop <> OLD.amount_cop OR
     NEW.points_used <> OLD.points_used OR
     NEW.payment_method_id <> OLD.payment_method_id OR
     NEW.created_at <> OLD.created_at OR
     NEW.quantity <> OLD.quantity OR
     coalesce(NEW.plan_id, '') <> coalesce(OLD.plan_id, '') THEN
    RAISE EXCEPTION 'No tienes permisos para modificar campos críticos de una orden existente (id, usuario, producto, precio, cantidad o plan).';
  END IF;

  -- B. Validar que no intenten cambiar el estado a uno restringido (como approved, procesando, etc.)
  IF NEW.status NOT IN ('pending', 'pending_nequi') THEN
    RAISE EXCEPTION 'No tienes permisos para establecer el estado de la orden a: %', NEW.status;
  END IF;

  -- C. Validar que la orden original esté en estado modificable
  IF OLD.status NOT IN ('pending', 'pending_nequi') THEN
    RAISE EXCEPTION 'No puedes modificar una orden que ya ha sido aprobada o procesada.';
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Vincular el disparador de validación a la tabla orders
DROP TRIGGER IF EXISTS trg_validate_order_update ON public.orders;
CREATE TRIGGER trg_validate_order_update
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_update_trigger();
