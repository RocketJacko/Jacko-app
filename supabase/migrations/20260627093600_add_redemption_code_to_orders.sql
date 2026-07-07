-- Migration: Add redemption_code to orders and auto-generate it upon approval
-- Date: 2026-06-27

-- 1. Add redemption_code column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS redemption_code TEXT UNIQUE;

-- 2. Create function to generate secure, unique, human-readable codes (Format: JK-XXXX-XXXX)
CREATE OR REPLACE FUNCTION public.generate_redemption_code()
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
  v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- Skip confusing characters like 0, 1, O, I, L
  v_i INT;
BEGIN
  LOOP
    -- Generate first block of 4 chars
    v_code := 'JK-';
    FOR v_i IN 1..4 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    
    v_code := v_code || '-';
    
    -- Generate second block of 4 chars
    FOR v_i IN 1..4 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    
    -- Check uniqueness
    SELECT EXISTS(SELECT 1 FROM public.orders WHERE redemption_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 3. Create a trigger function to automatically generate the code when an order is approved
CREATE OR REPLACE FUNCTION public.auto_generate_order_redemption_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.redemption_code IS NULL THEN
    NEW.redemption_code := public.generate_redemption_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 4. Create trigger BEFORE INSERT OR UPDATE on orders
DROP TRIGGER IF EXISTS trg_auto_generate_redemption_code ON public.orders;
CREATE TRIGGER trg_auto_generate_redemption_code
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_order_redemption_code();

-- 5. Backfill existing approved orders with redemption codes if they don't have one
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
