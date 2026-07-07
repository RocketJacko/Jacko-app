-- =============================================================================
-- MIGRACIÓN: CREACIÓN DE POOL DE CORREOS Y DISPARADOR EN ESPAÑOL
-- Ejecutar en el Editor SQL de Supabase
-- =============================================================================

-- 1. Crear la tabla pool_correos
CREATE TABLE IF NOT EXISTS public.pool_correos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'sin_asignar' CHECK (estado IN ('sin_asignar', 'asignado', 'bloqueado')),
  usuario_asignado UUID REFERENCES public.profiles(id) ON DELETE SET NULL NULL,
  plan_id TEXT REFERENCES public.pricing_plans(id) ON DELETE SET NULL NULL
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.pool_correos ENABLE ROW LEVEL SECURITY;

-- 3. Crear Políticas de Seguridad
DROP POLICY IF EXISTS "Admins full control on pool_correos" ON public.pool_correos;
CREATE POLICY "Admins full control on pool_correos"
  ON public.pool_correos
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'super_admin')
    OR auth.jwt() ->> 'role' = 'service_role'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'super_admin')
    OR auth.jwt() ->> 'role' = 'service_role'
  );

DROP POLICY IF EXISTS "Users can read own assigned email" ON public.pool_correos;
CREATE POLICY "Users can read own assigned email"
  ON public.pool_correos
  FOR SELECT
  USING (usuario_asignado = auth.uid());

-- 4. Modificar tabla orders para tener plan_id
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.pricing_plans(id) ON DELETE SET NULL NULL;

-- 5. Crear Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_pool_correos_plan_estado ON public.pool_correos(plan_id, estado);
CREATE INDEX IF NOT EXISTS idx_orders_plan_id ON public.orders(plan_id);

-- 6. Crear Función Disparadora de Asignación de Correos en Español
CREATE OR REPLACE FUNCTION funcion_disparadora_asignar_correo_por_orden()
RETURNS TRIGGER AS $$
DECLARE
  v_correo_id UUID;
  v_email TEXT;
BEGIN
  -- Actúa cuando el estado es 'approved'
  -- (Tanto en INSERT de una orden ya aprobada, como en UPDATE de estado de pendiente a approved)
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved')) THEN
     
    -- Solo si la orden tiene un plan_id
    IF NEW.plan_id IS NOT NULL THEN
      -- Buscar y bloquear un correo libre para ese plan_id
      SELECT id, email INTO v_correo_id, v_email
      FROM public.pool_correos
      WHERE plan_id = NEW.plan_id AND estado = 'sin_asignar'
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
        -- Si no se encontró un correo específico para el plan, intentar con uno general (plan_id IS NULL)
        SELECT id, email INTO v_correo_id, v_email
        FROM public.pool_correos
        WHERE plan_id IS NULL AND estado = 'sin_asignar'
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

-- 7. Crear el Disparador en Español
DROP TRIGGER IF EXISTS disparador_assignar_correo_por_orden ON public.orders;
DROP TRIGGER IF EXISTS disparador_asignar_correo_por_orden ON public.orders;

CREATE TRIGGER disparador_asignar_correo_por_orden
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION funcion_disparadora_asignar_correo_por_orden();

-- 8. Actualizar Función de Aprobación Manual de Órdenes
CREATE OR REPLACE FUNCTION approve_order(p_order_id UUID, p_admin_note TEXT)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
  v_admin_id uuid;
  v_status text;
  v_product_id uuid;
  v_credentials text;
  v_file_path text;
BEGIN
  v_admin_id := auth.uid();

  IF NOT (public.has_role(v_admin_id, 'admin') OR public.has_role(v_admin_id, 'super_admin')) THEN
    RETURN QUERY SELECT false, 'No autorizado'::text;
    RETURN;
  END IF;

  SELECT status, product_id
  INTO v_status, v_product_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_status <> 'pending' AND v_status <> 'pending_nequi' THEN
    RETURN QUERY SELECT false, 'Orden no pendiente'::text;
    RETURN;
  END IF;

  SELECT credentials, file_path
  INTO v_credentials, v_file_path
  FROM public.products
  WHERE id = v_product_id;

  UPDATE public.orders
  SET status = 'approved',
      approved_at = now(),
      reviewed_by = v_admin_id,
      admin_note = p_admin_note,
      delivered_credentials = CASE WHEN v_credentials IS NOT NULL AND v_credentials <> '' THEN v_credentials ELSE delivered_credentials END,
      delivered_file_path = v_file_path
  WHERE id = p_order_id;

  RETURN QUERY SELECT true, 'OK'::text;
END;
$$ LANGUAGE plpgsql;

-- 9. Actualizar Función de Rechazo Manual de Órdenes
CREATE OR REPLACE FUNCTION reject_order(p_order_id UUID, p_admin_note TEXT)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
  v_admin_id uuid;
  v_status text;
BEGIN
  v_admin_id := auth.uid();

  IF NOT (public.has_role(v_admin_id, 'admin') OR public.has_role(v_admin_id, 'super_admin')) THEN
    RETURN QUERY SELECT false, 'No autorizado'::text;
    RETURN;
  END IF;

  SELECT status
  INTO v_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_status <> 'pending' AND v_status <> 'pending_nequi' THEN
    RETURN QUERY SELECT false, 'Orden no pendiente'::text;
    RETURN;
  END IF;

  UPDATE public.orders
  SET status = 'rejected',
      reviewed_by = v_admin_id,
      admin_note = p_admin_note
  WHERE id = p_order_id;

  RETURN QUERY SELECT true, 'OK'::text;
END;
$$ LANGUAGE plpgsql;
