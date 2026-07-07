-- ============================================================
-- Migración: Perfil completo de usuario — JACKO™
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Renombrar columna 'nombre' a 'alias'
--    (alias = apodo/handle público del usuario)
ALTER TABLE public.profiles
  RENAME COLUMN nombre TO alias;

-- 2. Agregar columna 'ciudad' si no existe
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ciudad TEXT DEFAULT NULL;

-- 3. Agregar columna 'dial_code' si no existe
--    (prefijo telefónico del país: +57, +1, +52…)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dial_code TEXT DEFAULT NULL;

-- 4. Agregar columna 'avatar_url' si no existe
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;

-- 5. Comentarios descriptivos para cada columna nueva
COMMENT ON COLUMN public.profiles.alias      IS 'Apodo o nombre público del usuario en la plataforma JACKO';
COMMENT ON COLUMN public.profiles.ciudad     IS 'Ciudad de residencia del usuario';
COMMENT ON COLUMN public.profiles.dial_code  IS 'Prefijo telefónico del país (ej: +57, +1, +52)';
COMMENT ON COLUMN public.profiles.avatar_url IS 'URL pública de la foto de perfil, almacenada en el bucket avatars/';
