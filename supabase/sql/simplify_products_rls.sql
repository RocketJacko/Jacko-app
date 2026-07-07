-- 1. Eliminar políticas previas en public.products
DROP POLICY IF EXISTS products_admin_all ON public.products;
DROP POLICY IF EXISTS products_select_authenticated ON public.products;
DROP POLICY IF EXISTS products_insert_admin ON public.products;
DROP POLICY IF EXISTS products_update_admin ON public.products;
DROP POLICY IF EXISTS products_delete_admin ON public.products;

-- 2. Crear la nueva política de lectura (SELECT) basada únicamente en la visibilidad
-- - super_admin siempre puede ver todo.
-- - Si la visibilidad es 'public' (General), cualquiera puede verlo.
-- - Si la visibilidad es 'invited_only' (Invitado), solo lo ven quienes estén invitados.
CREATE POLICY products_select_authenticated ON public.products
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR (is_active = true AND visibility = 'public')
    OR (is_active = true AND visibility = 'invited_only' AND public.is_current_user_invited())
  );

-- 3. Crear políticas de modificación (INSERT, UPDATE, DELETE) para admins y super_admins
CREATE POLICY products_insert_admin ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY products_update_admin ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY products_delete_admin ON public.products
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );
