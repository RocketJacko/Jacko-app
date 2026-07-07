-- =============================================================================
-- MIGRACIÓN: SISTEMA DE SUSCRIPCIONES (GRATIS, BÁSICO, PREMIUM)
-- =============================================================================

-- 1. Añadir columna subscription_tier a public.profiles si no existe
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'basic', 'premium'));

-- 2. Actualizar la visibilidad de los productos actuales
UPDATE public.products SET visibility = 'basic' WHERE slug = 'platzimensualidad';
UPDATE public.products SET visibility = 'premium' WHERE slug = 'mini-curso-git-github';
UPDATE public.products SET visibility = 'free' WHERE slug = 'cuenta-puntos';

-- 3. Crear restricción CHECK en public.products.visibility si no existe
-- Nota: Primero limpiamos valores obsoletos en la columna antes de aplicar el CHECK
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_visibility_check;
ALTER TABLE public.products ADD CONSTRAINT products_visibility_check CHECK (visibility IN ('free', 'basic', 'premium'));

-- 4. Insertar los productos de Suscripción en la base de datos
INSERT INTO public.products (
  id, 
  title, 
  slug, 
  description, 
  short_description, 
  price_cop, 
  points_price, 
  visibility, 
  payment_modes, 
  is_active
)
VALUES 
  (
    '33333333-3333-3333-3333-333333333301', 
    'Suscripción Plan Básico', 
    'plan-basico', 
    'Acceso mensual a todos los productos marcados como Básico.', 
    'Suscripción Básica Mensual', 
    30000, 
    NULL, 
    'free', 
    'money', 
    true
  ),
  (
    '33333333-3333-3333-3333-333333333302', 
    'Suscripción Plan Premium', 
    'plan-premium', 
    'Acceso mensual ilimitado a todos los productos de la plataforma.', 
    'Suscripción Premium Mensual', 
    140000, 
    NULL, 
    'free', 
    'money', 
    true
  )
ON CONFLICT (slug) DO UPDATE
SET 
  price_cop = EXCLUDED.price_cop,
  visibility = 'free',
  is_active = true;

-- 5. Crear la función del disparador para actualizar automáticamente el tier del usuario al aprobarse un pago de suscripción
CREATE OR REPLACE FUNCTION public.update_user_subscription_tier_on_approved_order()
RETURNS TRIGGER AS $$
DECLARE
    v_slug TEXT;
BEGIN
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
        -- Obtener el slug del producto comprado
        SELECT slug INTO v_slug FROM public.products WHERE id = NEW.product_id;
        
        IF v_slug = 'plan-basico' THEN
            UPDATE public.profiles
            SET subscription_tier = 'basic', updated_at = now()
            WHERE id = NEW.user_id;
        ELSIF v_slug = 'plan-premium' THEN
            UPDATE public.profiles
            SET subscription_tier = 'premium', updated_at = now()
            WHERE id = NEW.user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Asignar el disparador a la tabla orders
DROP TRIGGER IF EXISTS trg_update_user_subscription_tier ON public.orders;
CREATE TRIGGER trg_update_user_subscription_tier
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_user_subscription_tier_on_approved_order();

-- 7. Crear la función RLS para validar si un usuario puede visualizar un producto según su suscripción
CREATE OR REPLACE FUNCTION public.check_user_can_view_product(p_visibility TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_tier TEXT;
BEGIN
  -- Super admins y staff siempre pueden ver todo
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') THEN
    RETURN TRUE;
  END IF;

  -- Visitantes no registrados solo ven productos 'free'
  IF auth.uid() IS NULL THEN
    RETURN p_visibility = 'free';
  END IF;

  -- Cargar el nivel de suscripción del perfil
  SELECT subscription_tier INTO v_user_tier
  FROM public.profiles
  WHERE id = auth.uid();

  -- Comprobación jerárquica de acceso
  IF v_user_tier = 'premium' THEN
    RETURN TRUE;
  ELSIF v_user_tier = 'basic' THEN
    RETURN p_visibility IN ('free', 'basic');
  ELSE
    -- Plan gratis
    RETURN p_visibility = 'free';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Actualizar las políticas RLS en la tabla products para SELECT
DROP POLICY IF EXISTS "products_select_policy" ON public.products;
DROP POLICY IF EXISTS "products_select" ON public.products;
DROP POLICY IF EXISTS "Users can view active public products" ON public.products;
DROP POLICY IF EXISTS "Admins can view all products" ON public.products;

CREATE POLICY "products_select_policy" ON public.products
  FOR SELECT
  TO public
  USING (
    (is_active = true AND public.check_user_can_view_product(visibility))
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );
