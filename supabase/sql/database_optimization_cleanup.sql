-- 1. Eliminar índices redundantes para optimizar almacenamiento y velocidad de inserción
DROP INDEX IF EXISTS public.idx_blocked_domains_name;
DROP INDEX IF EXISTS public.idx_admin_logs_admin_id;

-- NOTA: Las tablas contacts, contact_messages, site_settings, home_cards y task_resources
-- SE CONSERVAN INTACTAS ya que forman parte de la mesa de ayuda / soporte y futuras características.
