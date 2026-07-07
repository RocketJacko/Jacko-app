-- ============================================================
-- MIGRACIÓN: TRIGGER DE WEBHOOK PARA COMPRAS POR DINERO APROBADAS
-- Ejecutar en el Editor SQL de Supabase
-- ============================================================

-- 1. Modificar el check constraint de status en orders para permitir 'procesando' y 'procesado'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    'pending'::text, 
    'approved'::text, 
    'rejected'::text, 
    'cancelled'::text, 
    'pending_nequi'::text,
    'procesando'::text,
    'procesado'::text
  ])
);

-- 2. Crear la función disparadora para notificar órdenes aprobadas de tipo 'money'
CREATE OR REPLACE FUNCTION public.funcion_disparadora_notificar_orden_aprobada_dinero()
RETURNS TRIGGER AS $$
DECLARE
  v_webhook_url TEXT;
  v_api_key TEXT;
  v_product_title TEXT;
BEGIN
  -- Obtener la URL del webhook de n8n desde la configuración del sistema
  SELECT value INTO v_webhook_url
  FROM public.system_settings
  WHERE key = 'n8n_webhook_url';

  -- Fallback por defecto si no está configurada
  IF v_webhook_url IS NULL THEN
    v_webhook_url := 'https://ventusn8n.smartcontacts.cloud/webhook-test/8f448518-ab20-4aa7-a024-446ebb6e9c32';
  END IF;

  -- Obtener la API Key de n8n desde la configuración del sistema o usar la por defecto
  SELECT value INTO v_api_key
  FROM public.system_settings
  WHERE key = 'n8n_api_key';

  IF v_api_key IS NULL THEN
    v_api_key := 'ventus-secret-n8n-key-98765';
  END IF;

  -- Obtener el nombre del producto
  SELECT title INTO v_product_title
  FROM public.products
  WHERE id = NEW.product_id;

  -- Despachar el webhook asíncronamente vía pg_net
  PERFORM net.http_post(
    url := v_webhook_url,
    body := jsonb_build_object(
      'order_id', NEW.id,
      'user_id', NEW.user_id,
      'product_id', NEW.product_id,
      'product_title', coalesce(v_product_title, 'Producto'),
      'payment_type', NEW.payment_type,
      'amount_cop', NEW.amount_cop,
      'quantity', NEW.quantity,
      'plan_id', NEW.plan_id,
      'reference_note', NEW.reference_note,
      'created_at', NEW.created_at,
      'approved_at', NEW.approved_at
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', v_api_key
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear el disparador asociado
DROP TRIGGER IF EXISTS trigger_notify_approved_money_order ON public.orders;
CREATE TRIGGER trigger_notify_approved_money_order
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'approved' AND NEW.payment_type = 'money' AND NEW.reference_note IS NOT NULL)
EXECUTE FUNCTION public.funcion_disparadora_notificar_orden_aprobada_dinero();
