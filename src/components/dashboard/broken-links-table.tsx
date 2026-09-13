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
  Sparkles,
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
  ERROR_TYPE_LABELS,
  formatRelative,
  statusMeta,
  type BrokenLinkRow,
} from "@/lib/monitor-data";
import { type SeoIssueRow } from "@/lib/monitor.functions";
import { IssueFixModal, type IssueFixTarget } from "@/components/IssueFixModal";
import { findReplacementCandidates } from "@/lib/replacementEngine";
import {
  SEVERITY_BADGE,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  linkSeverity,
  seoIssueSeverity,
  type Severity,
} from "@/lib/healthScore";

const SEVERITY_FILTERS: { value: Severity | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "fixed", label: "Fixed" },
];

const YELLOW_BADGE = "bg-yellow-500/10 text-yellow-700 border-yellow-500/40 dark:text-yellow-400";
const RED_BADGE = "bg-red-500/10 text-red-600 border-red-500/40 dark:text-red-400";

/** Lifecycle state badges shown on every issue card. */
const STATE_BADGE: Record<string, { label: string; className: string }> = {
  detected: { label: "Detected", className: "bg-muted text-muted-foreground border-border" },
  suggested: {
    label: "Suggested",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/40 dark:text-blue-400",
  },
  fix_proposed: {
    label: "Fix Proposed",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/40 dark:text-blue-400",
  },
  approved: {
    label: "Approved",
    className: "bg-indigo-500/10 text-indigo-600 border-indigo-500/40 dark:text-indigo-400",
  },
  awaiting_fix: {
    label: "Awaiting Fix",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/40 dark:text-amber-400",
  },
  fixed: {
    label: "Fixed",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/40 dark:text-emerald-400",
  },
  verified: {
    label: "Verified",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/50 dark:text-emerald-300",
  },
  ignored: { label: "Ignored", className: "bg-muted text-muted-foreground border-border" },
};

function stateBadge(state: string | null | undefined) {
  return STATE_BADGE[state ?? "detected"] ?? STATE_BADGE["detected"]!;
}

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
    tip: 'Add descriptive alt attributes to the listed images. Describe what the image shows; use alt="" only for purely decorative images.',
  },
  insecure_internal_link: {
    label: "Insecure Link",
    className: YELLOW_BADGE,
    tip: "Update the internal link to use https://. Mixed http:// links can trigger browser warnings and waste crawl budget on redirects.",
  },
};

type Row =
  | {
      kind: "link";
      id: string;
      domain: string;
      detected_at: string;
      severity: Severity;
      link: BrokenLinkRow;
    }
  | {
      kind: "seo";
      id: string;
      domain: string;
      detected_at: string;
      severity: Severity;
      issue: SeoIssueRow;
    };

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
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [fixTarget, setFixTarget] = useState<BrokenLinkRow | null>(null);
  const [replacementUrl, setReplacementUrl] = useState("");
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [seoTarget, setSeoTarget] = useState<SeoIssueRow | null>(null);
  const [reviewTarget, setReviewTarget] = useState<IssueFixTarget | null>(null);

  /** Live pages discovered during crawls — candidate replacements for dead links. */
  const candidateUrls = useMemo(() => {
    const set = new Set<string>();
    for (const l of links) {
      set.add(l.source_url);
      if (l.replacement_url) set.add(l.replacement_url);
    }
    for (const i of seoIssues) set.add(i.url);
    return [...set];
  }, [links, seoIssues]);

  const allRows = useMemo<Row[]>(() => {
    const linkRows: Row[] = links.map((link) => ({
      kind: "link",
      id: link.id,
      domain: link.domain,
      detected_at: link.detected_at,
      severity: linkSeverity(link),
      link,
    }));
    const seoRows: Row[] = seoIssues.map((issue) => ({
      kind: "seo",
      id: issue.id,
      domain: issue.domain,
      detected_at: issue.detected_at,
      severity: seoIssueSeverity(issue),
      issue,
    }));
    // Prioritized: critical first, then high → low → fixed, newest first within a tier.
    return [...linkRows, ...seoRows].sort((a, b) => {
      const tier = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      if (tier !== 0) return tier;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });
  }, [links, seoIssues]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (domainFilter && row.domain !== domainFilter) return false;
      if (severityFilter !== "all" && row.severity !== severityFilter) return false;
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
  }, [allRows, query, severityFilter, domainFilter]);

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
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search URLs, anchor text, or issues…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SEVERITY_FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={severityFilter === f.value ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setSeverityFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading issues…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Link2Off className="h-5 w-5" />
            <span className="text-sm">No issues found. Scan a site to check for problems.</span>
          </div>
        ) : (
          rows.map((row) => {
            const busy = busyId === row.id;
            const criticalCard =
              row.severity === "critical" ? "border-red-500/50 bg-red-500/5" : "";

            if (row.kind === "seo") {
              const issue = row.issue;
              const meta = SEO_META[issue.type] ?? {
                label: "SEO Issue",
                className: YELLOW_BADGE,
                tip: "",
              };
              return (
                <div
                  key={row.id}
                  className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between ${criticalCard}`}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={SEVERITY_BADGE[row.severity]}>
                        {SEVERITY_LABEL[row.severity]}
                      </Badge>
                      <Badge variant="outline" className={meta.className}>
                        {meta.label}
                      </Badge>
                      <Badge variant="outline" className={stateBadge(issue.issue_state).className}>
                        {stateBadge(issue.issue_state).label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {row.domain} · {formatRelative(issue.detected_at)}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{issue.message}</p>
                    <p className="truncate text-xs text-muted-foreground" title={issue.url}>
                      {issue.url}
                    </p>
                    {issue.detail && (
                      <p
                        className="truncate text-xs text-muted-foreground"
                        title={issue.detail}
                      >
                        {issue.detail}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={busy}
                      onClick={() => setReviewTarget({ kind: "seo", issue })}
                    >
                      <Sparkles className="h-3 w-3" />
                      <span className="ml-1">Review Fix</span>
                    </Button>
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
                </div>
              );
            }

            const link = row.link;
            const meta = statusMeta(link.http_status);
            const fixed = link.fixed_at !== null;
            const topCandidate = fixed
              ? null
              : (findReplacementCandidates(
                  link.target_url,
                  link.anchor_text ?? "",
                  candidateUrls.map((url) => ({ url, title: "" })),
                )[0] ?? null);
            return (
              <div
                key={row.id}
                className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between ${criticalCard}`}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={SEVERITY_BADGE[row.severity]}>
                      {SEVERITY_LABEL[row.severity]}
                    </Badge>
                    {fixed ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
                      >
                        Fixed / Redirected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={meta.className}>
                        {meta.label}
                      </Badge>
                    )}
                    <Badge variant="outline" className={stateBadge(link.issue_state).className}>
                      {stateBadge(link.issue_state).label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {row.domain} · {formatRelative(link.detected_at)}
                    </span>
                  </div>
                  <p className="truncate text-sm font-medium" title={link.source_url}>
                    {link.source_url}
                  </p>
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
                  <p className="truncate text-xs text-muted-foreground">
                    “{link.anchor_text ?? "(no anchor text)"}” ·{" "}
                    {fixed ? "Redirected" : (ERROR_TYPE_LABELS[link.error_type] ?? link.error_type)}
                  </p>
                  {fixed && link.replacement_url && (
                    <a
                      href={link.replacement_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                      title={link.replacement_url}
                    >
                      → {link.replacement_url}
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={() => setReviewTarget({ kind: "link", link })}
                  >
                    <Sparkles className="h-3 w-3" />
                    <span className="ml-1">Review Fix</span>
                  </Button>
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
              </div>
            );
          })
        )}
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
              Enter the replacement URL for this broken link. It will be saved and the link marked
              as Fixed / Redirected.
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
                <p className="mt-1 break-all text-xs text-muted-foreground">{seoTarget.detail}</p>
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
      <IssueFixModal
        target={reviewTarget}
        candidateUrls={candidateUrls}
        onOpenChange={(open) => !open && setReviewTarget(null)}
        onApplyLinkFix={onFix}
        onIgnore={(t) => {
          if (t.kind === "link") onDelete(t.link.id);
          else onDeleteSeoIssue(t.issue.id);
        }}
      />
    </Card>
  );
}
