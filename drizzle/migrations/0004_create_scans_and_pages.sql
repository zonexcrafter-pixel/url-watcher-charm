-- Scan runs
CREATE TABLE public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  pages_scanned INTEGER NOT NULL DEFAULT 0,
  links_checked INTEGER NOT NULL DEFAULT 0,
  broken_count INTEGER NOT NULL DEFAULT 0,
  seo_issue_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalized per-page crawl records
CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  website_id UUID NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  http_status INTEGER,
  response_time_ms INTEGER,
  title TEXT,
  meta_description TEXT,
  h1_count INTEGER,
  canonical_url TEXT,
  is_allowed_by_robots BOOLEAN NOT NULL DEFAULT true,
  redirected_to TEXT,
  redirect_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pages_scan ON public.pages(scan_id);
CREATE INDEX idx_scans_website ON public.scans(website_id);

-- Link rows and issue rows belong to a scan run
ALTER TABLE public.broken_links ADD COLUMN scan_id UUID REFERENCES public.scans(id) ON DELETE CASCADE;
ALTER TABLE public.broken_links ADD COLUMN is_redirect BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.broken_links ADD COLUMN redirect_target TEXT;
ALTER TABLE public.seo_issues ADD COLUMN scan_id UUID REFERENCES public.scans(id) ON DELETE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scans TO authenticated;
GRANT ALL ON public.scans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pages TO authenticated;
GRANT ALL ON public.pages TO service_role;

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scans" ON public.scans
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.websites w WHERE w.id = scans.website_id AND w.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.websites w WHERE w.id = scans.website_id AND w.user_id = auth.uid()));

CREATE POLICY "Users manage own pages" ON public.pages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.websites w WHERE w.id = pages.website_id AND w.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.websites w WHERE w.id = pages.website_id AND w.user_id = auth.uid()));