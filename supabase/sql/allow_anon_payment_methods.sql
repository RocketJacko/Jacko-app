-- Permitir acceso de lectura a payment_methods para usuarios no autenticados (anon)
CREATE POLICY "Allow public read access to payment_methods" ON payment_methods FOR SELECT USING (true);
