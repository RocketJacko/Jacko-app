-- Crear la tabla public.system_settings para configuraciones globales del sistema
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas previas si existen
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON public.system_settings;
DROP POLICY IF EXISTS "Allow admins and super_admins to write settings" ON public.system_settings;

-- Crear política de lectura: Cualquier usuario autenticado puede leer las configuraciones
CREATE POLICY "Allow authenticated users to read settings" 
  ON public.system_settings FOR SELECT 
  TO authenticated 
  USING (true);

-- Crear política de escritura: Solo los usuarios con rol admin o super_admin pueden escribir
CREATE POLICY "Allow admins and super_admins to write settings" 
  ON public.system_settings FOR ALL 
  TO authenticated 
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Insertar valor inicial para la URL del webhook de n8n si no existe
INSERT INTO public.system_settings (key, value)
VALUES ('n8n_webhook_url', 'https://ventusn8n.smartcontacts.cloud/webhook-test/8f448518-ab20-4aa7-a024-446ebb6e9c32')
ON CONFLICT (key) DO NOTHING;
