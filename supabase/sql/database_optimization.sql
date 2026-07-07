-- 1. Crear índices para claves foráneas y acelerar los JOINS principales
CREATE INDEX IF NOT EXISTS idx_orders_product_id 
  ON public.orders(product_id);

CREATE INDEX IF NOT EXISTS idx_products_category_id 
  ON public.products(category_id);

CREATE INDEX IF NOT EXISTS idx_orders_payment_method_id 
  ON public.orders(payment_method_id);

CREATE INDEX IF NOT EXISTS idx_orders_reviewed_by 
  ON public.orders(reviewed_by);

CREATE INDEX IF NOT EXISTS idx_product_credentials_pool_used_in_order 
  ON public.product_credentials_pool(used_in_order);

CREATE INDEX IF NOT EXISTS idx_pool_correos_usuario_asignado 
  ON public.pool_correos(usuario_asignado);

-- 2. Optimizar la búsqueda FIFO de correos en el pool (Index-Only pre-ordenado)
CREATE INDEX IF NOT EXISTS idx_pool_correos_plan_estado_fecha 
  ON public.pool_correos(plan_id, estado, fecha_creacion ASC);

-- 3. Eliminar de forma segura la tabla no utilizada
DROP TABLE IF EXISTS public.order_messages CASCADE;
