-- =============================================================================
-- AGREGAR CANTIDAD A TABLA DE ÓRDENES
-- =============================================================================

ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

COMMENT ON COLUMN orders.quantity IS 'Cantidad de unidades del producto adquiridas en esta orden';
