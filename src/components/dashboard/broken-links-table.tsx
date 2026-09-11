import { useMemo, useState } from "react";
import { ArrowUpRight, Link2Off, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  STATUS_FILTER_OPTIONS,
  formatRelative,
  statusMeta,
  type BrokenLinkRow,
} from "@/lib/monitor-data";

export function BrokenLinksTable({
  links,
  loading,
  domainFilter,
  onDelete,
  onRecheck,
  busyId,
}: {
  links: BrokenLinkRow[];
  loading: boolean;
  domainFilter: string | null;
  onDelete: (id: string) => void;
  onRecheck: (id: string) => void;
  busyId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return links.filter((link) => {
      if (domainFilter && link.domain !== domainFilter) return false;
      if (statusFilter === "unreachable" && link.http_status !== null) return false;
      if (
        statusFilter !== "all" &&
        statusFilter !== "unreachable" &&
        link.http_status !== Number(statusFilter)
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

  return (
    <Card>
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Broken Links</CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {rows.length} result{rows.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search URLs or anchor text…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Status code" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                return (
                  <TableRow key={link.id}>
                    <TableCell className="pl-6">
                      <Badge variant="outline" className={meta.className}>
                        {meta.label}
                      </Badge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {ERROR_TYPE_LABELS[link.error_type] ?? link.error_type}
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
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {link.domain}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatRelative(link.detected_at)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-1">
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
    </Card>
  );
}
