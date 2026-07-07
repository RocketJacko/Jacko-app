-- ============================================================
-- MIGRACIÓN: AGREGAR CAMPOS DE ACTIVACIÓN A LA TABLA DE ÓRDENES
-- Ejecutar en el Editor SQL de Supabase
-- ============================================================

-- 1. Agregar columnas para soportar la activación manual
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS activation_details JSONB DEFAULT '[]'::jsonb;

-- 2. Asegurar que las órdenes existentes tengan un valor por defecto válido si la columna es nula
UPDATE public.orders
SET activation_details = '[]'::jsonb
WHERE activation_details IS NULL;

-- 3. Comentarios descriptivos
COMMENT ON COLUMN public.orders.activated_at IS 'Fecha y hora de la última activación del servicio';
COMMENT ON COLUMN public.orders.activation_details IS 'Array JSONB que registra los detalles de cada activación de cuenta {first_name, last_name, email, activated_at}';
