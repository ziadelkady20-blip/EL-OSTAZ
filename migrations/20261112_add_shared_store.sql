CREATE TABLE IF NOT EXISTS public.catalog_categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_categories_name_unique_idx ON public.catalog_categories (LOWER(name));
CREATE TABLE IF NOT EXISTS public.catalog_products (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES public.catalog_categories(id) ON DELETE RESTRICT,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS catalog_products_category_active_idx ON public.catalog_products (category_id, active, created_at DESC);
ALTER TABLE public.print_orders ADD COLUMN IF NOT EXISTS catalog_items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.print_orders ADD COLUMN IF NOT EXISTS catalog_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.print_orders ADD COLUMN IF NOT EXISTS print_total NUMERIC(12,2);
INSERT INTO public.catalog_categories (name, active)
VALUES ('أدوات مدرسية', TRUE), ('كراسات وكشاكيل', TRUE), ('أقلام وأدوات كتابة', TRUE), ('مستلزمات مكتبية', TRUE)
ON CONFLICT DO NOTHING;
