-- =============================================================================
-- MIGRACIÓN: VALIDACIÓN DE UNICIDAD DE NÚMERO MÓVIL
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Añadir restricción UNIQUE para evitar duplicados a nivel de base de datos
--    El prefijo (dial_code) y el número telefónico (phone_number) combinados deben ser únicos.
--    Nota: Los valores NULL no entran en el chequeo de la restricción, por lo que perfiles
--    nuevos sin teléfono no se verán bloqueados.
ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_dial_code_phone_number_key UNIQUE (dial_code, phone_number);

-- 2. Crear función RPC SECURITY DEFINER para verificar duplicados
--    Esta función corre con privilegios de superusuario (bypass RLS) para poder
--    comprobar la existencia del teléfono de otros usuarios.
CREATE OR REPLACE FUNCTION public.check_phone_exists(
  p_dial_code text,
  p_phone_number text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE dial_code = p_dial_code 
      AND phone_number = p_phone_number
      AND id <> p_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.check_phone_exists IS 'Verifica si el número telefónico con el mismo prefijo ya existe en la base de datos para un usuario diferente';
