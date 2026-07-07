-- =============================================================================
-- MIGRACIÓN: ACTUALIZAR POLÍTICA RLS PARA SOPORTES DE PAGO NEQUI/PENDIENTES
-- Permite que el usuario actualice la orden (comprobante_url) si está en estado pending o pending_nequi.
-- =============================================================================

DROP POLICY IF EXISTS "orders_update_own_pending" ON public.orders;

CREATE POLICY "orders_update_own_pending" ON public.orders
  FOR UPDATE
  TO public
  USING (
    auth.uid() = user_id 
    AND (status = 'pending'::text OR status = 'pending_nequi'::text OR status = 'approved'::text OR status = 'procesando'::text)
  )
  WITH CHECK (
    auth.uid() = user_id 
    AND (status = 'pending'::text OR status = 'pending_nequi'::text OR status = 'approved'::text OR status = 'procesando'::text OR status = 'procesado'::text)
  );
