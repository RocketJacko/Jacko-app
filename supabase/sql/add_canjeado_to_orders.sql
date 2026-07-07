-- Agregar columna canjeado a la tabla orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS canjeado BOOLEAN NOT NULL DEFAULT false;

-- Crear un índice para optimizar las consultas por canjeado
CREATE INDEX IF NOT EXISTS idx_orders_canjeado ON public.orders(canjeado);
