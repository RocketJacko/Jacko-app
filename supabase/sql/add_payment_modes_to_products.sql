-- Agregar columna payment_modes a la tabla products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS payment_modes TEXT DEFAULT 'both' 
CHECK (payment_modes IN ('money', 'points', 'both'));

-- Asegurar que los registros existentes tengan el valor por defecto
UPDATE public.products 
SET payment_modes = 'both' 
WHERE payment_modes IS NULL;
