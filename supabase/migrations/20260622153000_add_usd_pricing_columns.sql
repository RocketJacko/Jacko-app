-- Migration: Add USD pricing columns for products, plans, and orders, and update the unified view.

BEGIN;

-- 1. Add USD columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_usd NUMERIC(10, 2);
ALTER TABLE public.pricing_plans ADD COLUMN IF NOT EXISTS price_usd NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(10, 2);

-- 2. Migrate existing values
-- Initialize price_usd dynamically with default division / 3700.0, but use exact values for standard monthly/annual plans
UPDATE public.products 
SET price_usd = CASE 
  WHEN slug = 'plan-mensual' THEN 8.00 
  WHEN slug = 'plan-anual' THEN 35.00 
  ELSE ROUND((price_cop::numeric / 3700.0), 2) 
END;

UPDATE public.pricing_plans 
SET price_usd = CASE 
  WHEN id = 'mensual' OR id = 'plan-mensual' THEN 8.00 
  WHEN id = 'anual' OR id = 'plan-anual' THEN 35.00 
  ELSE ROUND((price_cop::numeric / 3700.0), 2) 
END;

UPDATE public.orders
SET amount_usd = ROUND((amount_cop::numeric / 3700.0), 2)
WHERE amount_cop IS NOT NULL AND amount_cop > 0;

-- 3. Recreate the products_with_plans view to include price_usd
CREATE OR REPLACE VIEW public.products_with_plans AS
SELECT 
  p.id,
  p.slug,
  p.title,
  p.description,
  p.short_description,
  p.price_cop,
  p.price_usd,
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
          'price_usd', pp.price_usd,
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

COMMIT;
