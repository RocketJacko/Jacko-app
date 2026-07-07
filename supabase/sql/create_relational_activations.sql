-- 1. Crear tabla de activaciones de slots relacional
CREATE TABLE IF NOT EXISTS public.order_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    activated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT unique_order_email UNIQUE (order_id, email)
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.order_activations ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas de seguridad RLS
DROP POLICY IF EXISTS "Admins can manage all activations" ON public.order_activations;
CREATE POLICY "Admins can manage all activations" ON public.order_activations
    FOR ALL
    TO authenticated
    USING (
        public.has_role(auth.uid(), 'super_admin') OR 
        public.has_role(auth.uid(), 'admin')
    )
    WITH CHECK (
        public.has_role(auth.uid(), 'super_admin') OR 
        public.has_role(auth.uid(), 'admin')
    );

DROP POLICY IF EXISTS "Users can read own order activations" ON public.order_activations;
CREATE POLICY "Users can read own order activations" ON public.order_activations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_activations.order_id
              AND orders.user_id = auth.uid()
        )
    );

-- 4. Función y Trigger BEFORE INSERT para validar límites de slots comprados
CREATE OR REPLACE FUNCTION public.validar_limite_activacion_slots()
RETURNS TRIGGER AS $$
DECLARE
    v_quantity INT;
    v_current_count INT;
BEGIN
    -- Obtener la cantidad de slots comprados en la orden (por defecto 1 si es nulo)
    SELECT coalesce(quantity, 1) INTO v_quantity
    FROM public.orders
    WHERE id = NEW.order_id;

    -- Contar activaciones ya existentes para esta orden
    SELECT COUNT(*) INTO v_current_count
    FROM public.order_activations
    WHERE order_id = NEW.order_id;

    -- Validar si se excede el límite
    IF v_current_count >= v_quantity THEN
        RAISE EXCEPTION 'Límite de activaciones alcanzado para esta orden.'
            USING DETAIL = 'limite_slots_excedido';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_validar_limite_activacion_slots ON public.order_activations;
CREATE TRIGGER trigger_validar_limite_activacion_slots
    BEFORE INSERT ON public.order_activations
    FOR EACH ROW
    EXECUTE FUNCTION public.validar_limite_activacion_slots();

-- 5. Función y Trigger AFTER para sincronizar activaciones al campo JSONB de la orden
CREATE OR REPLACE FUNCTION public.sincronizar_activaciones_a_orden()
RETURNS TRIGGER AS $$
DECLARE
    v_order_id UUID;
    v_activations JSONB;
    v_quantity INT;
    v_count INT;
    v_is_fully_redeemed BOOLEAN;
    v_new_status TEXT;
    v_latest_activated_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Determinar el order_id afectado según la operación DML
    IF TG_OP = 'DELETE' THEN
        v_order_id := OLD.order_id;
    ELSE
        v_order_id := NEW.order_id;
    END IF;

    -- Obtener la cantidad de slots comprados en la orden
    SELECT coalesce(quantity, 1) INTO v_quantity
    FROM public.orders
    WHERE id = v_order_id;

    -- Generar el JSONB array de activaciones asociadas a la orden
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'first_name', first_name,
                'last_name', last_name,
                'email', email,
                'activated_at', to_char(activated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            ) ORDER BY activated_at ASC
        ),
        '[]'::jsonb
    ) INTO v_activations
    FROM public.order_activations
    WHERE order_id = v_order_id;

    -- Contar número actual de activaciones registradas en la tabla
    SELECT COUNT(*) INTO v_count
    FROM public.order_activations
    WHERE order_id = v_order_id;

    -- Obtener la fecha de la última activación
    SELECT MAX(activated_at) INTO v_latest_activated_at
    FROM public.order_activations
    WHERE order_id = v_order_id;

    -- Determinar si se canjearon todos los slots
    v_is_fully_redeemed := (v_count >= v_quantity);
    
    -- Definir el nuevo estado de la orden
    IF v_is_fully_redeemed THEN
        v_new_status := 'procesado';
    ELSE
        -- Si la orden está en proceso pero quedan slots libres, la devolvemos a approved
        -- para que el usuario pueda seguir asignando slots en el historial.
        v_new_status := 'approved';
    END IF;

    -- Actualizar autoritativamente la orden en orders para mantener compatibilidad
    UPDATE public.orders
    SET activation_details = v_activations,
        activated_at = v_latest_activated_at,
        canjeado = v_is_fully_redeemed,
        status = v_new_status
    WHERE id = v_order_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sincronizar_activaciones ON public.order_activations;
CREATE TRIGGER trigger_sincronizar_activaciones
    AFTER INSERT OR UPDATE OR DELETE ON public.order_activations
    FOR EACH ROW
    EXECUTE FUNCTION public.sincronizar_activaciones_a_orden();

-- 6. Script de Backfill: migrar activaciones JSONB existentes a order_activations
DO $$
DECLARE
    r RECORD;
    v_elem JSONB;
BEGIN
    FOR r IN 
        SELECT id, activation_details 
        FROM public.orders 
        WHERE activation_details IS NOT NULL 
          AND jsonb_typeof(activation_details) = 'array' 
          AND jsonb_array_length(activation_details) > 0
    LOOP
        FOR v_elem IN SELECT jsonb_array_elements(r.activation_details) LOOP
            INSERT INTO public.order_activations (order_id, email, first_name, last_name, activated_at)
            VALUES (
                r.id,
                v_elem->>'email',
                v_elem->>'first_name',
                v_elem->>'last_name',
                COALESCE((v_elem->>'activated_at')::timestamp with time zone, now())
            )
            ON CONFLICT (order_id, email) DO NOTHING;
        END LOOP;
    END LOOP;
END;
$$;
