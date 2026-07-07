-- Fix RLS policy for pricing_plans to allow public SELECT access
-- This ensures that anonymous visitors on the landing page can view the pricing cards from the database.

-- 1. Drop the old authenticated-only select policy
DROP POLICY IF EXISTS pricing_plans_select_authenticated ON pricing_plans;

-- 2. Create the new public select policy
DROP POLICY IF EXISTS pricing_plans_select_public ON pricing_plans;
CREATE POLICY pricing_plans_select_public ON pricing_plans 
  FOR SELECT 
  TO public 
  USING (true);
