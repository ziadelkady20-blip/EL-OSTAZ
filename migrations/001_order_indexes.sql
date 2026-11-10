-- Safe, additive performance indexes for order listing and status filtering.
-- Existing order records and settings are preserved.
CREATE INDEX IF NOT EXISTS print_orders_created_at_idx
  ON public.print_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS print_orders_status_created_at_idx
  ON public.print_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS print_orders_phone_idx
  ON public.print_orders (phone);
