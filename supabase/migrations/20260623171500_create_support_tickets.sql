-- Migration: Create support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  topic TEXT NOT NULL CHECK (topic IN ('pago', 'cuentas', 'cupon', 'otros')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'closed')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow anyone to insert tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Allow staff to select tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Allow staff to update tickets" ON public.support_tickets;

-- Policies:
-- 1. Allow anyone (including anonymous guest users) to submit support tickets
CREATE POLICY "Allow anyone to insert tickets" ON public.support_tickets
  FOR INSERT TO public WITH CHECK (true);

-- 2. Allow staff/admin to view all tickets
CREATE POLICY "Allow staff to select tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );

-- 3. Allow staff/admin to update tickets
CREATE POLICY "Allow staff to update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );
