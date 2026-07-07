-- Migración: Agregar columna image_url a la tabla tasks
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.tasks.image_url IS 'URL pública de la imagen representativa de la tarea (puede ser del Storage de Supabase o externa)';
