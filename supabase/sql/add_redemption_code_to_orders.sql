-- ============================================================
-- MIGRACIÓN: AGREGAR CÓDIGOS DE CANJE (REDEMPTION CODES)
-- Ejecutar en el Editor SQL de Supabase (Dashboard)
-- ============================================================

-- 1. Agregar columna redemption_code a la tabla orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS redemption_code TEXT UNIQUE;

-- 2. Crear función para generar códigos seguros, únicos y legibles (Formato: JK-XXXX-XXXX)
CREATE OR REPLACE FUNCTION public.generate_redemption_code()
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
  v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- Excluye caracteres confusos como 0, 1, O, I, L
  v_i INT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- Re-definir la lógica interna de la función
CREATE OR REPLACE FUNCTION public.generate_redemption_code()
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
  v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_i INT;
BEGIN
  LOOP
    -- Generar primer bloque de 4 caracteres
    v_code := 'JK-';
    FOR v_i IN 1..4 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    
    v_code := v_code || '-';
    
    -- Generar segundo bloque de 4 caracteres
    FOR v_i IN 1..4 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    
    -- Validar unicidad
    SELECT EXISTS(SELECT 1 FROM public.orders WHERE redemption_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 3. Crear función disparadora para auto-generar el código al aprobar la orden
CREATE OR REPLACE FUNCTION public.auto_generate_order_redemption_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.redemption_code IS NULL THEN
    NEW.redemption_code := public.generate_redemption_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 4. Crear el disparador BEFORE INSERT OR UPDATE en orders
DROP TRIGGER IF EXISTS trg_auto_generate_redemption_code ON public.orders;
CREATE TRIGGER trg_auto_generate_redemption_code
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_order_redemption_code();

-- 5. Backfill: Generar códigos de canje para órdenes aprobadas existentes que no tengan uno
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE status = 'approved' AND redemption_code IS NULL LOOP
    UPDATE public.orders 
    SET redemption_code = public.generate_redemption_code()
    WHERE id = r.id;
  END LOOP;
END;
$$;
