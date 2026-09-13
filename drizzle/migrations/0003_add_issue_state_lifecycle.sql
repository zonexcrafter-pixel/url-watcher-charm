ALTER TABLE public.broken_links
  ADD COLUMN IF NOT EXISTS issue_state text NOT NULL DEFAULT 'detected',
  ADD COLUMN IF NOT EXISTS state_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_status integer;

ALTER TABLE public.seo_issues
  ADD COLUMN IF NOT EXISTS issue_state text NOT NULL DEFAULT 'detected',
  ADD COLUMN IF NOT EXISTS state_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS broken_links_issue_state_idx ON public.broken_links (issue_state);
CREATE INDEX IF NOT EXISTS seo_issues_issue_state_idx ON public.seo_issues (issue_state);