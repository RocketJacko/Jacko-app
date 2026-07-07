CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
  RETURN v_user_id;
END;
$$;

-- Revoke execute from public to be safe
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) FROM public;
-- Allow authenticated users to call it (or just service_role)
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO service_role;

-- Deshabilitar mercadopago de forma segura
UPDATE public.payment_methods SET is_active = false WHERE type IN ('mercadopago', 'pago');
