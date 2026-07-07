-- =============================================================================
-- MIGRACIÓN: SIMPLIFICACIÓN A SUSCRIPCIONES MENSUAL Y ANUAL (CON RLS DE SEGURIDAD PRESERVADO)
-- =============================================================================

BEGIN;

-- 1. Eliminar restricciones check antiguas si existen
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_visibility_check;

-- 2. Migrar registros de datos existentes en perfiles (basic -> mensual, premium -> anual)
UPDATE public.profiles SET subscription_tier = 'mensual' WHERE subscription_tier = 'basic';
UPDATE public.profiles SET subscription_tier = 'anual' WHERE subscription_tier = 'premium';
-- Por si acaso hay algún registro vacío
UPDATE public.profiles SET subscription_tier = 'free' WHERE subscription_tier IS NULL OR subscription_tier = '';

-- 3. Crear las nuevas restricciones CHECK seguras en profiles
ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_subscription_tier_check 
  CHECK (subscription_tier IN ('free', 'mensual', 'anual'));

-- 4. Migrar registros de visibilidad de productos existentes
UPDATE public.products SET visibility = 'mensual' WHERE visibility = 'basic';
UPDATE public.products SET visibility = 'anual' WHERE visibility = 'premium';
-- Asegurar que los productos tengan visibilidad válida
UPDATE public.products SET visibility = 'free' WHERE visibility IS NULL OR visibility = '';

-- 5. Crear las nuevas restricciones CHECK seguras en products
ALTER TABLE public.products 
  ADD CONSTRAINT products_visibility_check 
  CHECK (visibility IN ('free', 'mensual', 'anual'));

-- 6. Renombrar y actualizar los productos de suscripción existentes
-- A. Básico -> Mensual
UPDATE public.products 
SET 
  slug = 'plan-mensual', 
  title = 'Suscripción Plan Mensual', 
  short_description = 'Suscripción Mensual',
  description = 'Acceso mensual a todos los productos marcados como Mensual.',
  price_cop = 30000
WHERE id = '33333333-3333-3333-3333-333333333301' OR slug = 'plan-basico';

-- B. Premium -> Anual
UPDATE public.products 
SET 
  slug = 'plan-anual', 
  title = 'Suscripción Plan Anual', 
  short_description = 'Suscripción Anual Billed Annually',
  description = 'Acceso anual ilimitado a todos los productos de la plataforma.',
  price_cop = 140000
WHERE id = '33333333-3333-3333-3333-333333333302' OR slug = 'plan-premium';

-- 7. Redefinir la función disparadora para actualizar el tier al aprobar órdenes
CREATE OR REPLACE FUNCTION public.update_user_subscription_tier_on_approved_order()
RETURNS TRIGGER AS $$
DECLARE
    v_slug TEXT;
BEGIN
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
        -- Obtener el slug del producto comprado
        SELECT slug INTO v_slug FROM public.products WHERE id = NEW.product_id;
        
        IF v_slug = 'plan-mensual' THEN
            UPDATE public.profiles
            SET subscription_tier = 'mensual', updated_at = now()
            WHERE id = NEW.user_id;
        ELSIF v_slug = 'plan-anual' THEN
            UPDATE public.profiles
            SET subscription_tier = 'anual', updated_at = now()
            WHERE id = NEW.user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Redefinir la función RLS de visibilidad con la jerarquía: free < mensual < anual
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
  IF v_user_tier = 'anual' THEN
    RETURN TRUE;
  ELSIF v_user_tier = 'mensual' THEN
    RETURN p_visibility IN ('free', 'mensual');
  ELSE
    -- Plan gratis
    RETURN p_visibility = 'free';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
