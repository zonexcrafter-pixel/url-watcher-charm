import { useMemo, useState } from "react";
import { ArrowUpRight, Link2Off, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  brokenLinks,
  formatRelative,
  statusCodeMeta,
} from "@/lib/monitor-data";

const STATUS_OPTIONS = ["all", "404", "500", "403", "410", "301", "502", "503", "408"];

export function BrokenLinksTable({ domainFilter }: { domainFilter: string | null }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return brokenLinks.filter((link) => {
      if (domainFilter && link.domain !== domainFilter) return false;
      if (statusFilter !== "all" && link.statusCode !== Number(statusFilter)) return false;
      if (
        q &&
        !link.sourceUrl.toLowerCase().includes(q) &&
        !link.targetUrl.toLowerCase().includes(q) &&
        !link.anchorText.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [query, statusFilter, domainFilter]);

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
              {STATUS_OPTIONS.map((code) => (
                <SelectItem key={code} value={code}>
                  {code === "all" ? "All status codes" : statusCodeMeta[Number(code)]?.label ?? code}
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
              <TableHead className="pr-6 text-right">Detected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Link2Off className="h-6 w-6" />
                    <p className="text-sm">No broken links match your filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((link) => {
                const meta = statusCodeMeta[link.statusCode];
                return (
                  <TableRow key={link.id}>
                    <TableCell className="pl-6">
                      <Badge variant="outline" className={meta?.className}>
                        {link.statusCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <div className="truncate text-sm" title={link.sourceUrl}>
                        {link.sourceUrl}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        “{link.anchorText}”
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <a
                        href={link.targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center gap-1 text-sm text-destructive hover:underline"
                        title={link.targetUrl}
                      >
                        <span className="truncate">{link.targetUrl}</span>
                        <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {link.domain}
                    </TableCell>
                    <TableCell className="pr-6 text-right text-sm tabular-nums text-muted-foreground">
                      {formatRelative(link.detectedAt)}
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
