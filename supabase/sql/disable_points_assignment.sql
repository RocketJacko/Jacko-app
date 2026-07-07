-- =============================================================================
-- MIGRACIÓN: DESACTIVACIÓN CONTROLADA DE ASIGNACIÓN DE PUNTOS POR TAREAS
-- =============================================================================

-- Redefinir la función award_points_on_task_completion para desactivar la acumulación de puntos.
-- Se establece el valor a 0 de forma fija para ignorar cualquier entrada externa
-- y evitar que se ejecute la lógica de actualización en public.profiles y public.point_transactions.
CREATE OR REPLACE FUNCTION public.award_points_on_task_completion()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Desactivado: La economía de puntos se ha desactivado a favor de las suscripciones.
  NEW.points_awarded := 0;

  IF NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.award_points_on_task_completion IS 'Función desactivada. Establece los puntos ganados por tareas en 0 para deshabilitar la economía de puntos.';
