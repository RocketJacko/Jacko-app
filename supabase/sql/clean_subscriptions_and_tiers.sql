-- =============================================================================
-- LIMPIEZA DE SUSCRIPCIONES Y TRÁNSITO A COMPRA DIRECTA DE PRODUCTOS
-- Ejecutar en: Supabase Dashboard -> SQL Editor
-- =============================================================================

BEGIN;

-- 1. Eliminar trigger de actualización de tier en orders
DROP TRIGGER IF EXISTS trg_update_user_subscription_tier ON public.orders;
DROP FUNCTION IF EXISTS public.update_user_subscription_tier_on_approved_order();

-- 2. Eliminar columna de suscripción en profiles y su restricción
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS subscription_tier;

-- 3. Eliminar restricción de visibilidad en productos
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_visibility_check;

-- 4. Eliminar función de validación de visibilidad de productos
DROP FUNCTION IF EXISTS public.check_user_can_view_product(TEXT);

-- 5. Recrear política SELECT en products para remover verificación de suscripciones
DROP POLICY IF EXISTS "products_select_policy" ON public.products;
CREATE POLICY "products_select_policy" ON public.products
  FOR SELECT
  TO public
  USING (
    is_active = true
    OR public.has_role(auth.uid(), 'admin'::text)
    OR public.has_role(auth.uid(), 'super_admin'::text)
  );

-- 6. Eliminar la función RPC obsoleta check_email_has_subscription
DROP FUNCTION IF EXISTS public.check_email_has_subscription(TEXT);

-- 7. Eliminar los productos de suscripción mensuales y anuales
DELETE FROM public.products WHERE slug IN ('plan-mensual', 'plan-anual');

COMMIT;
