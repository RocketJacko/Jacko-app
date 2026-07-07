-- Fix function 'has_role' to run with SECURITY DEFINER privileges.
-- This bypasses RLS/permission issues on the user_roles table when checking user permissions.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = _user_id AND user_roles.role = _role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix the storage policy for nequi-comprobantes bucket to read from user_roles instead of auth.users
-- This resolves the "permission denied for table users" error when listing files in storage.
DROP POLICY IF EXISTS "Admin or owner can read nequi comprobante" ON storage.objects;
CREATE POLICY "Admin or owner can read nequi comprobante" ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'nequi-comprobantes'
    AND (
      auth.role() = 'service_role'
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_roles.user_id = auth.uid() 
        AND user_roles.role = 'super_admin'
      )
    )
  );
