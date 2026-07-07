-- =============================================================================
-- BACKUP: handle_assign_email_from_pool_trigger
-- Respaldo del estado actual antes de modificaciones de lógica de negocio.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_assign_email_from_pool_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_correo_id UUID;
  v_email TEXT;
  v_emails_list TEXT[] := ARRAY[]::TEXT[];
  v_quantity INT;
  i INT;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved')) THEN
     
    v_quantity := coalesce(NEW.quantity, 1);
    IF v_quantity <= 0 THEN
      v_quantity := 1;
    END IF;

    FOR i IN 1..v_quantity LOOP
      v_correo_id := null;
      v_email := null;

      -- Select email using priority logic
      SELECT id, email INTO v_correo_id, v_email
      FROM public.email_pool
      WHERE status = 'unassigned'
        AND (product_id = NEW.product_id OR product_id IS NULL)
        AND (
          (NEW.plan_id IS NOT NULL AND NEW.plan_id <> '' AND (plan_id = NEW.plan_id OR plan_id IS NULL))
          OR
          ((NEW.plan_id IS NULL OR NEW.plan_id = '') AND plan_id IS NULL)
        )
      ORDER BY
        (CASE WHEN product_id = NEW.product_id THEN 1 ELSE 2 END) ASC,
        (CASE WHEN plan_id = NEW.plan_id THEN 1 ELSE 2 END) ASC,
        created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_correo_id IS NOT NULL THEN
        UPDATE public.email_pool
        SET status = 'assigned',
            assigned_user_id = NEW.user_id
        WHERE id = v_correo_id;

        v_emails_list := array_append(v_emails_list, v_email);
      END IF;
    END LOOP;

    IF array_length(v_emails_list, 1) > 0 THEN
      NEW.delivered_credentials := 'Tu cuenta asignada: ' || array_to_string(v_emails_list, ', ');
      
      IF array_length(v_emails_list, 1) < v_quantity THEN
        NEW.admin_note := coalesce(NEW.admin_note, '') || ' [ADVERTENCIA: No se encontraron suficientes correos disponibles en el pool]';
      END IF;
    ELSE
      NEW.admin_note := coalesce(NEW.admin_note, '') || ' [ADVERTENCIA: No se encontraron correos disponibles en el pool para este plan]';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreación del trigger asociado
DROP TRIGGER IF EXISTS trg_assign_email_from_pool ON public.orders;
CREATE TRIGGER trg_assign_email_from_pool
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_assign_email_from_pool_trigger();
