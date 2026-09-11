CREATE TABLE public.websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scanning',
  last_scanned_at TIMESTAMPTZ,
  pages_scanned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.websites TO authenticated;
GRANT ALL ON public.websites TO service_role;

ALTER TABLE public.websites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own websites" ON public.websites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own websites" ON public.websites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own websites" ON public.websites
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own websites" ON public.websites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.broken_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor_text TEXT,
  http_status INTEGER,
  error_type TEXT NOT NULL DEFAULT 'not_found',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX broken_links_website_id_idx ON public.broken_links (website_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broken_links TO authenticated;
GRANT ALL ON public.broken_links TO service_role;

ALTER TABLE public.broken_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own broken links" ON public.broken_links
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.websites w WHERE w.id = website_id AND w.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own broken links" ON public.broken_links
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.websites w WHERE w.id = website_id AND w.user_id = auth.uid())
  );
CREATE POLICY "Users can update own broken links" ON public.broken_links
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.websites w WHERE w.id = website_id AND w.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.websites w WHERE w.id = website_id AND w.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own broken links" ON public.broken_links
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.websites w WHERE w.id = website_id AND w.user_id = auth.uid())
  );