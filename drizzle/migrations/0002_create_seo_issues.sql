CREATE TABLE public.seo_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('error','warning')),
  message TEXT NOT NULL,
  detail TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX seo_issues_website_id_idx ON public.seo_issues (website_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_issues TO authenticated;
GRANT ALL ON public.seo_issues TO service_role;
ALTER TABLE public.seo_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage SEO issues of their own sites"
  ON public.seo_issues
  FOR ALL
  TO authenticated
  USING (website_id IN (SELECT id FROM public.websites WHERE user_id = auth.uid()))
  WITH CHECK (website_id IN (SELECT id FROM public.websites WHERE user_id = auth.uid()));