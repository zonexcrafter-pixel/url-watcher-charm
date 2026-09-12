ALTER TABLE public.broken_links ADD COLUMN replacement_url text;
ALTER TABLE public.broken_links ADD COLUMN fixed_at timestamp with time zone;