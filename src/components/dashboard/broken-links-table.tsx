import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Download,
  Lightbulb,
  Link2Off,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ERROR_TYPE_LABELS,
  formatRelative,
  statusMeta,
  type BrokenLinkRow,
  type SeoIssueRow,
} from "@/lib/monitor-data";

type Tab = "all" | "links" | "seo";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All Issues" },
  { value: "links", label: "Broken Links (404)" },
  { value: "seo", label: "SEO Fixes" },
];

const YELLOW_BADGE =
  "bg-yellow-500/10 text-yellow-700 border-yellow-500/40 dark:text-yellow-400";
const RED_BADGE =
  "bg-red-500/10 text-red-600 border-red-500/40 dark:text-red-400";

/** Short label + badge color for each SEO issue type. */
const SEO_META: Record<string, { label: string; className: string; tip: string }> = {
  title_missing: {
    label: "Missing Title",
    className: RED_BADGE,
    tip: "Add a unique, descriptive <title> tag in the page <head>. Keep it between 30 and 60 characters and lead with the primary keyword.",
  },
  title_length: {
    label: "Title Length",
    className: YELLOW_BADGE,
    tip: "Rewrite the title to 30–60 characters. Shorter titles get truncated in search results; longer ones dilute keywords.",
  },
  meta_description_missing: {
    label: "Missing Meta Description",
    className: YELLOW_BADGE,
    tip: 'Add <meta name="description" content="…"> in the page <head>. Write a compelling 70–160 character summary with a call to action.',
  },
  meta_description_length: {
    label: "Meta Description Length",
    className: YELLOW_BADGE,
    tip: "Adjust the meta description to 70–160 characters so it displays fully in search results without being cut off.",
  },
  h1_missing: {
    label: "Missing H1",
    className: RED_BADGE,
    tip: "Add exactly one <h1> heading near the top of the page that describes the page's main topic and includes the target keyword.",
  },
  h1_multiple: {
    label: "Multiple H1s",
    className: YELLOW_BADGE,
    tip: "Keep a single <h1> per page. Demote the other headings to <h2> or <h3> so search engines can identify the primary topic.",
  },
  img_alt_missing: {
    label: "Missing Alt Text",
    className: YELLOW_BADGE,
    tip: "Add descriptive alt attributes to the listed images. Describe what the image shows; use alt=\"\" only for purely decorative images.",
  },
  insecure_internal_link: {
    label: "Insecure Link",
    className: YELLOW_BADGE,
    tip: "Update the internal link to use https://. Mixed http:// links can trigger browser warnings and waste crawl budget on redirects.",
  },
};

type Row =
  | { kind: "link"; id: string; domain: string; detected_at: string; link: BrokenLinkRow }
  | { kind: "seo"; id: string; domain: string; detected_at: string; issue: SeoIssueRow };

function csvEscape(value: string | null): string {
  const v = value ?? "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportCsv(links: BrokenLinkRow[]) {
  const header = [
    "Domain",
    "Source Page",
    "Broken Target",
    "Status Code",
    "Anchor Text",
    "Date Detected",
  ];
  const lines = links.map((r) =>
    [
      r.domain,
      r.source_url,
      r.target_url,
      r.http_status === null ? "Unreachable" : String(r.http_status),
      r.anchor_text ?? "",
      new Date(r.detected_at).toLocaleDateString(),
    ]
      .map(csvEscape)
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `linkwatch-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BrokenLinksTable({
  links,
  seoIssues,
  loading,
  domainFilter,
  onDelete,
  onRecheck,
  onFix,
  onDeleteSeoIssue,
  busyId,
}: {
  links: BrokenLinkRow[];
  seoIssues: SeoIssueRow[];
  loading: boolean;
  domainFilter: string | null;
  onDelete: (id: string) => void;
  onRecheck: (id: string) => void;
  onFix: (id: string, replacementUrl: string) => Promise<void>;
  onDeleteSeoIssue: (id: string) => void;
  busyId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [fixTarget, setFixTarget] = useState<BrokenLinkRow | null>(null);
  const [replacementUrl, setReplacementUrl] = useState("");
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [seoTarget, setSeoTarget] = useState<SeoIssueRow | null>(null);

  const allRows = useMemo<Row[]>(() => {
    const linkRows: Row[] = links.map((link) => ({
      kind: "link",
      id: link.id,
      domain: link.domain,
      detected_at: link.detected_at,
      link,
    }));
    const seoRows: Row[] = seoIssues.map((issue) => ({
      kind: "seo",
      id: issue.id,
      domain: issue.domain,
      detected_at: issue.detected_at,
      issue,
    }));
    return [...linkRows, ...seoRows].sort(
      (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime(),
    );
  }, [links, seoIssues]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (domainFilter && row.domain !== domainFilter) return false;
      if (tab === "links" && row.kind !== "link") return false;
      if (tab === "seo" && row.kind !== "seo") return false;
      if (!q) return true;
      if (row.kind === "link") {
        const l = row.link;
        return (
          l.source_url.toLowerCase().includes(q) ||
          l.target_url.toLowerCase().includes(q) ||
          (l.anchor_text ?? "").toLowerCase().includes(q)
        );
      }
      const i = row.issue;
      return (
        i.url.toLowerCase().includes(q) ||
        i.message.toLowerCase().includes(q) ||
        (i.detail ?? "").toLowerCase().includes(q)
      );
    });
  }, [allRows, query, tab, domainFilter]);

  async function submitFix() {
    if (!fixTarget) return;
    setFixing(true);
    setFixError(null);
    try {
      await onFix(fixTarget.id, replacementUrl);
      setFixTarget(null);
      setReplacementUrl("");
    } catch (error) {
      setFixError(error instanceof Error ? error.message : "Could not save replacement");
    } finally {
      setFixing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Site Issues</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {rows.length} result{rows.length === 1 ? "" : "s"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={links.length === 0}
              onClick={() => exportCsv(links)}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export Audit Report
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search URLs, anchor text, or issues…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            {TABS.map((t) => (
              <Button
                key={t.value}
                variant={tab === t.value ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setTab(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Status</TableHead>
              <TableHead>Page / Source URL</TableHead>
              <TableHead>Issue Details</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead className="text-right">Detected</TableHead>
              <TableHead className="pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading issues…</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Link2Off className="h-5 w-5" />
                    <span className="text-sm">
                      No issues found. Scan a site to check for problems.
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const busy = busyId === row.id;
                if (row.kind === "seo") {
                  const issue = row.issue;
                  const meta = SEO_META[issue.type] ?? {
                    label: "SEO Issue",
                    className: YELLOW_BADGE,
                    tip: "",
                  };
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="pl-6">
                        <Badge variant="outline" className={meta.className}>
                          {meta.label}
                        </Badge>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {issue.severity === "error" ? "Error" : "Warning"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-64">
                        <div className="truncate text-sm" title={issue.url}>
                          {issue.url}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {issue.message}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-64">
                        <div
                          className="truncate text-sm text-muted-foreground"
                          title={issue.detail ?? issue.message}
                        >
                          {issue.detail ?? issue.message}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.domain}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {formatRelative(issue.detected_at)}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={busy}
                            onClick={() => setSeoTarget(issue)}
                          >
                            <Lightbulb className="h-3 w-3" />
                            <span className="ml-1 hidden sm:inline">SEO Fix</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            disabled={busy}
                            onClick={() => onDeleteSeoIssue(issue.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            <span className="ml-1 hidden sm:inline">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                const link = row.link;
                const meta = statusMeta(link.http_status);
                const fixed = link.fixed_at !== null;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6">
                      {fixed ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
                        >
                          Fixed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={meta.className}>
                          {meta.label}
                        </Badge>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {fixed
                          ? "Redirected"
                          : (ERROR_TYPE_LABELS[link.error_type] ?? link.error_type)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <div className="truncate text-sm" title={link.source_url}>
                        {link.source_url}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        “{link.anchor_text ?? "(no anchor text)"}”
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <a
                        href={link.target_url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center gap-1 text-sm text-destructive hover:underline"
                        title={link.target_url}
                      >
                        <span className="truncate">{link.target_url}</span>
                        <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                      {fixed && link.replacement_url && (
                        <a
                          href={link.replacement_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 block truncate text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                          title={link.replacement_url}
                        >
                          → {link.replacement_url}
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.domain}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatRelative(link.detected_at)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-1">
                        {!fixed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={busy}
                            onClick={() => {
                              setFixTarget(link);
                              setReplacementUrl(link.replacement_url ?? "");
                              setFixError(null);
                            }}
                          >
                            <Wrench className="h-3 w-3" />
                            <span className="ml-1 hidden sm:inline">Fix Link</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={busy}
                          onClick={() => onRecheck(link.id)}
                        >
                          <RefreshCw className={busy ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
                          <span className="ml-1 hidden sm:inline">Re-check</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={busy}
                          onClick={() => onDelete(link.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                          <span className="ml-1 hidden sm:inline">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog
        open={fixTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFixTarget(null);
            setFixError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fix Link</DialogTitle>
            <DialogDescription>
              Enter the replacement URL for this broken link. It will be saved and the
              link marked as Fixed / Redirected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Broken:</span>{" "}
              <span className="break-all">{fixTarget?.target_url}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="replacement-url">Target Replacement URL</Label>
              <Input
                id="replacement-url"
                placeholder="https://example.com/new-page"
                value={replacementUrl}
                onChange={(e) => setReplacementUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitFix();
                }}
              />
              {fixError && <p className="text-xs text-destructive">{fixError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFixTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitFix()} disabled={fixing || !replacementUrl.trim()}>
              {fixing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save Replacement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={seoTarget !== null} onOpenChange={(open) => !open && setSeoTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {seoTarget ? (SEO_META[seoTarget.type]?.label ?? "SEO Issue") : "SEO Issue"}
            </DialogTitle>
            <DialogDescription>
              Detected on <span className="break-all">{seoTarget?.url}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium text-foreground">{seoTarget?.message}</p>
              {seoTarget?.detail && (
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {seoTarget.detail}
                </p>
              )}
            </div>
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-400">
                <Lightbulb className="h-3.5 w-3.5" />
                How to fix
              </p>
              <p className="mt-1 text-sm text-foreground">
                {seoTarget ? SEO_META[seoTarget.type]?.tip : ""}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeoTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
