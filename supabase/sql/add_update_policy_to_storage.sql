-- =============================================================================
-- MIGRACIÓN: PERMITIR A LOS USUARIOS ACTUALIZAR (UPSERT) SUS COMPROBANTES
-- =============================================================================

DROP POLICY IF EXISTS "Users can update own comprobante" ON storage.objects;

CREATE POLICY "Users can update own comprobante" ON storage.objects
  FOR UPDATE
  TO public
  USING (
    bucket_id = 'nequi-comprobantes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
