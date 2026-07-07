-- ============================================================
-- Fix: Convertir columna 'alias' de GENERADA a regular TEXT
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Verificar el estado actual de la columna
SELECT
  column_name,
  data_type,
  is_generated,
  generation_expression
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'profiles'
  AND column_name  IN ('alias', 'nombre');

-- 2. Eliminar la columna generada y recrearla como texto regular
--    (PostgreSQL no permite ALTER COLUMN en columnas generadas)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS alias;
ALTER TABLE public.profiles ADD COLUMN alias TEXT DEFAULT NULL;

COMMENT ON COLUMN public.profiles.alias IS 'Apodo o nombre público del usuario en la plataforma JACKO';

-- 3. Rellenar alias con full_name para usuarios que ya tienen nombre
UPDATE public.profiles
SET alias = full_name
WHERE alias IS NULL AND full_name IS NOT NULL;
