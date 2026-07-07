-- Agregar columna invited_by a la tabla invitados para registrar quién hizo la invitación
ALTER TABLE public.invitados ADD COLUMN IF NOT EXISTS invited_by text;

COMMENT ON COLUMN public.invitados.invited_by IS 'Correo electrónico del administrador que generó la invitación';
