import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, TrendingDown, TrendingUp, Minus, BadgeCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { calculateHealthScore, type ScoreIssue } from "@/lib/healthScore";
import { formatRelative } from "@/lib/monitor-data";

interface ScanRow {
  id: string;
  website_id: string;
  status: string;
  pages_scanned: number;
  broken_count: number;
  seo_issue_count: number;
  started_at: string;
  finished_at: string | null;
}

/**
 * Derive a LinkWatch Health Score for a historic scan from its stored counts:
 * each broken link counts as a critical deduction, each SEO issue as medium.
 */
function scanScore(scan: ScanRow): number {
  const issues: ScoreIssue[] = [
    ...Array.from({ length: scan.broken_count }, () => ({ severity: "critical" as const })),
    ...Array.from({ length: scan.seo_issue_count }, () => ({ severity: "medium" as const })),
  ];
  return calculateHealthScore(issues).score;
}

export function ScanHistory() {
  const scansQuery = useQuery({
    queryKey: ["scan-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scans")
        .select(
          "id, website_id, status, pages_scanned, broken_count, seo_issue_count, started_at, finished_at",
        )
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ScanRow[];
    },
  });

  const verifiedQuery = useQuery({
    queryKey: ["verified-fixes-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("broken_links")
        .select("id", { count: "exact", head: true })
        .eq("issue_state", "verified");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const scans = useMemo(() => scansQuery.data ?? [], [scansQuery.data]);

  const latest = scans.find((s) => s.status === "completed" || s.finished_at) ?? scans[0];
  const previous = latest
    ? scans.filter((s) => s.id !== latest.id && s.website_id === latest.website_id)[0]
    : undefined;

  const delta =
    latest && previous ? scanScore(latest) - scanScore(previous) : null;
  const verifiedFixes = verifiedQuery.data ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Scan History</CardTitle>
        </div>
        {latest && (
          <div className="flex items-center gap-3 text-sm">
            {delta !== null && (
              <span
                className={`flex items-center gap-1 font-medium ${
                  delta > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : delta < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                }`}
              >
                {delta > 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : delta < 0 ? (
                  <TrendingDown className="h-4 w-4" />
                ) : (
                  <Minus className="h-4 w-4" />
                )}
                {delta > 0 ? `+${delta}` : delta} points vs previous scan
              </span>
            )}
            {verifiedFixes > 0 && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <BadgeCheck className="h-4 w-4" />
                {verifiedFixes} verified {verifiedFixes === 1 ? "fix" : "fixes"}
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {scans.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {scansQuery.isLoading ? "Loading scan history…" : "No scans yet — run your first audit."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scan Date</TableHead>
                <TableHead className="text-right">Pages</TableHead>
                <TableHead className="text-right">Open Issues</TableHead>
                <TableHead className="text-right">Health Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.map((scan) => {
                const score = scanScore(scan);
                return (
                  <TableRow key={scan.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {new Date(scan.started_at).toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(scan.started_at)} · {scan.status}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{scan.pages_scanned}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {scan.broken_count + scan.seo_issue_count}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${
                        score >= 80
                          ? "text-emerald-600 dark:text-emerald-400"
                          : score >= 50
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {score}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
