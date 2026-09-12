import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Download,
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
} from "@/lib/monitor-data";

const STATUS_PILLS = [
  { value: "all", label: "All" },
  { value: "404", label: "404 Not Found" },
  { value: "server", label: "Server Error" },
] as const;

function csvEscape(value: string | null): string {
  const v = value ?? "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportCsv(rows: BrokenLinkRow[]) {
  const header = [
    "Domain",
    "Source Page",
    "Broken Target",
    "Status Code",
    "Anchor Text",
    "Date Detected",
  ];
  const lines = rows.map((r) =>
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
  loading,
  domainFilter,
  onDelete,
  onRecheck,
  onFix,
  busyId,
}: {
  links: BrokenLinkRow[];
  loading: boolean;
  domainFilter: string | null;
  onDelete: (id: string) => void;
  onRecheck: (id: string) => void;
  onFix: (id: string, replacementUrl: string) => Promise<void>;
  busyId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fixTarget, setFixTarget] = useState<BrokenLinkRow | null>(null);
  const [replacementUrl, setReplacementUrl] = useState("");
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return links.filter((link) => {
      if (domainFilter && link.domain !== domainFilter) return false;
      if (statusFilter === "404" && link.http_status !== 404) return false;
      if (
        statusFilter === "server" &&
        (link.http_status === null || link.http_status < 500)
      )
        return false;
      if (
        q &&
        !link.source_url.toLowerCase().includes(q) &&
        !link.target_url.toLowerCase().includes(q) &&
        !(link.anchor_text ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [links, query, statusFilter, domainFilter]);

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
          <CardTitle className="text-base">Broken Links</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {rows.length} result{rows.length === 1 ? "" : "s"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length === 0}
              onClick={() => exportCsv(rows)}
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
              placeholder="Search URLs or anchor text…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            {STATUS_PILLS.map((pill) => (
              <Button
                key={pill.value}
                variant={statusFilter === pill.value ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setStatusFilter(pill.value)}
              >
                {pill.label}
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
              <TableHead>Source URL</TableHead>
              <TableHead>Broken Target</TableHead>
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
                    <span className="text-sm">Loading broken links…</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Link2Off className="h-5 w-5" />
                    <span className="text-sm">
                      No broken links found. Scan a site to check for issues.
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((link) => {
                const meta = statusMeta(link.http_status);
                const busy = busyId === link.id;
                const fixed = link.fixed_at !== null;
                return (
                  <TableRow key={link.id}>
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
                      {link.domain}
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
    </Card>
  );
}
