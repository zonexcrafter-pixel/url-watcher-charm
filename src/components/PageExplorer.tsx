import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PageRow = Tables<"pages">;

function statusBadge(status: number | null) {
  if (status === null) return "bg-muted text-muted-foreground border-border";
  if (status >= 200 && status < 300)
    return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400";
  if (status >= 300 && status < 400)
    return "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400";
  if (status >= 400 && status < 500)
    return "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400";
  return "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400";
}

/**
 * Table of all pages discovered during scans of a website, with a detail
 * modal showing the parsed HTML metadata for the selected page.
 */
export function PageExplorer({ websiteId }: { websiteId: string | null }) {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PageRow | null>(null);

  useEffect(() => {
    if (!websiteId) {
      setPages([]);
      setIssueCounts({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [pagesRes, linksRes, seoRes] = await Promise.all([
        supabase
          .from("pages")
          .select("*")
          .eq("website_id", websiteId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("broken_links").select("source_url").eq("website_id", websiteId),
        supabase.from("seo_issues").select("url").eq("website_id", websiteId),
      ]);
      if (cancelled) return;
      setPages(pagesRes.data ?? []);
      const counts: Record<string, number> = {};
      for (const l of linksRes.data ?? []) {
        counts[l.source_url] = (counts[l.source_url] ?? 0) + 1;
      }
      for (const i of seoRes.data ?? []) {
        counts[i.url] = (counts[i.url] ?? 0) + 1;
      }
      setIssueCounts(counts);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [websiteId]);

  // Latest row per URL (a page may appear in multiple scans).
  const latestPages = useMemo(() => {
    const seen = new Map<string, PageRow>();
    for (const p of pages) if (!seen.has(p.url)) seen.set(p.url, p);
    return [...seen.values()];
  }, [pages]);

  if (!websiteId) return null;

  return (
    <div className="rounded-lg border">
      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading pages…</span>
        </div>
      ) : latestPages.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No pages crawled yet for this site.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead className="w-[110px]">HTTP Status</TableHead>
              <TableHead className="w-[110px]">Issues</TableHead>
              <TableHead className="w-[110px]">Internal Links</TableHead>
              <TableHead className="w-[110px]">External Links</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {latestPages.map((page) => (
              <TableRow
                key={page.id}
                className="cursor-pointer"
                onClick={() => setSelected(page)}
              >
                <TableCell className="max-w-0 truncate font-medium" title={page.url}>
                  {page.url}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadge(page.http_status)}>
                    {page.http_status ?? "Error"}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">{issueCounts[page.url] ?? 0}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">—</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">—</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{selected?.url}</DialogTitle>
            <DialogDescription>Parsed HTML metadata from the latest crawl.</DialogDescription>
          </DialogHeader>
          {selected && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">Title</dt>
                <dd>{selected.title ?? <span className="text-muted-foreground">(missing)</span>}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">
                  Meta Description
                </dt>
                <dd>
                  {selected.meta_description ?? (
                    <span className="text-muted-foreground">(missing)</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">H1 Count</dt>
                <dd className="tabular-nums">{selected.h1_count ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">
                  Canonical URL
                </dt>
                <dd className="break-all">
                  {selected.canonical_url ?? (
                    <span className="text-muted-foreground">(missing)</span>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
