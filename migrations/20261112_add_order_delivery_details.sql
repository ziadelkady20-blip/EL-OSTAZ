ALTER TABLE public.print_orders
  ADD COLUMN IF NOT EXISTS fulfillment_method VARCHAR(20) NOT NULL DEFAULT 'pickup',
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;
