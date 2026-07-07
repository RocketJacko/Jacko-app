-- =============================================================================
-- FUNCIÓN RPC: GUARDAR PRODUCTO CON PLANES DE FORMA ATÓMICA
-- Ejecutar en el Editor SQL de Supabase
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_product_with_plans(
  p_product_id UUID,
  p_product_data JSONB,
  p_plans_data JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_id UUID;
  v_plan JSONB;
  v_plan_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1. Verificar roles de administrador
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'No autorizado. Permisos de administrador requeridos.';
  END IF;

  -- 2. Insertar o actualizar producto
  IF p_product_id IS NULL THEN
    INSERT INTO public.products (
      title, 
      slug, 
      category_id, 
      short_description, 
      description, 
      price_cop, 
      price_usd, -- Soporte para precio USD
      points_price, 
      stock, 
      is_active, 
      thumbnail_url, 
      file_path, 
      external_url, 
      credentials, 
      accordions, 
      visibility, 
      payment_modes
    ) VALUES (
      (p_product_data->>'title')::text,
      (p_product_data->>'slug')::text,
      (p_product_data->>'category_id')::uuid,
      (p_product_data->>'short_description')::text,
      (p_product_data->>'description')::text,
      COALESCE((p_product_data->>'price_cop')::integer, 0),
      (p_product_data->>'price_usd')::numeric, -- Guardado de precio USD
      (p_product_data->>'points_price')::integer,
      (p_product_data->>'stock')::integer,
      COALESCE((p_product_data->>'is_active')::boolean, true),
      (p_product_data->>'thumbnail_url')::text,
      (p_product_data->>'file_path')::text,
      (p_product_data->>'external_url')::text,
      (p_product_data->>'credentials')::text,
      (p_product_data->'accordions')::jsonb,
      COALESCE((p_product_data->>'visibility')::text, 'public'),
      COALESCE((p_product_data->>'payment_modes')::text, 'both')
    ) RETURNING id INTO v_product_id;
  ELSE
    UPDATE public.products SET
      title = (p_product_data->>'title')::text,
      slug = (p_product_data->>'slug')::text,
      category_id = (p_product_data->>'category_id')::uuid,
      short_description = (p_product_data->>'short_description')::text,
      description = (p_product_data->>'description')::text,
      price_cop = COALESCE((p_product_data->>'price_cop')::integer, 0),
      price_usd = (p_product_data->>'price_usd')::numeric, -- Actualización de precio USD
      points_price = (p_product_data->>'points_price')::integer,
      stock = (p_product_data->>'stock')::integer,
      is_active = COALESCE((p_product_data->>'is_active')::boolean, true),
      thumbnail_url = (p_product_data->>'thumbnail_url')::text,
      file_path = (p_product_data->>'file_path')::text,
      external_url = (p_product_data->>'external_url')::text,
      credentials = (p_product_data->>'credentials')::text,
      accordions = (p_product_data->'accordions')::jsonb,
      visibility = COALESCE((p_product_data->>'visibility')::text, 'public'),
      payment_modes = COALESCE((p_product_data->>'payment_modes')::text, 'both'),
      updated_at = now()
    WHERE id = p_product_id;
    v_product_id := p_product_id;
  END IF;

  -- 3. Guardar planes de precios asociados si existen
  IF p_plans_data IS NOT NULL AND jsonb_array_length(p_plans_data) > 0 THEN
    -- Realizar el UPSERT de cada plan
    FOR v_plan IN SELECT jsonb_array_elements(p_plans_data) LOOP
      INSERT INTO public.pricing_plans (
        product_id, 
        id, 
        name, 
        price_cop, 
        price_usd, -- Soporte para precio USD en planes
        points_price, 
        short_description, 
        description, 
        require_new_account, 
        bulk_pricing, 
        accordions
      ) VALUES (
        v_product_id,
        (v_plan->>'id')::text,
        (v_plan->>'name')::text,
        COALESCE((v_plan->>'price_cop')::integer, 0),
        (v_plan->>'price_usd')::numeric, -- Guardado de precio USD en planes
        (v_plan->>'points_price')::integer,
        (v_plan->>'short_description')::text,
        (v_plan->>'description')::text,
        COALESCE((v_plan->>'require_new_account')::boolean, false),
        (v_plan->'bulk_pricing')::jsonb,
        (v_plan->'accordions')::jsonb
      ) ON CONFLICT (product_id, id) DO UPDATE SET
        name = EXCLUDED.name,
        price_cop = EXCLUDED.price_cop,
        price_usd = EXCLUDED.price_usd, -- Actualización de precio USD en planes
        points_price = EXCLUDED.points_price,
        short_description = EXCLUDED.short_description,
        description = EXCLUDED.description,
        require_new_account = EXCLUDED.require_new_account,
        bulk_pricing = EXCLUDED.bulk_pricing,
        accordions = EXCLUDED.accordions,
        updated_at = now();
         
      v_plan_ids := array_append(v_plan_ids, (v_plan->>'id')::text);
    END LOOP;

    -- Eliminar los planes que ya no se enviaron en el request actual
    DELETE FROM public.pricing_plans
    WHERE product_id = v_product_id AND NOT (id = ANY(v_plan_ids));
  ELSE
    -- Si no se pasaron planes en la carga, eliminar todos los planes de este producto
    DELETE FROM public.pricing_plans WHERE product_id = v_product_id;
  END IF;

  RETURN v_product_id;
END;
$$;
