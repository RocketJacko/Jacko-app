-- =============================================================================
-- FUNCION RPC: Verificar si un email tiene una suscripción/orden activa o rol
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_email_has_subscription(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_has_role BOOLEAN;
    v_has_order BOOLEAN;
    v_has_activation BOOLEAN;
BEGIN
    -- 1. Intentar encontrar el usuario por email en auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
    
    IF v_user_id IS NOT NULL THEN
        -- 2. Check if user is admin/super_admin
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')
        ) INTO v_has_role;
        
        IF v_has_role THEN
            RETURN TRUE;
        END IF;

        -- 3. Check if user has an approved or pending order
        SELECT EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.user_id = v_user_id 
              AND o.status IN ('approved', 'pending')
        ) INTO v_has_order;

        IF v_has_order THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- 4. Check if the email exists in order_activations
    SELECT EXISTS (
        SELECT 1 FROM public.order_activations WHERE email = p_email
    ) INTO v_has_activation;

    IF v_has_activation THEN
        RETURN TRUE;
    END IF;

    -- Si llegamos aquí, no tiene acceso permitido
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
