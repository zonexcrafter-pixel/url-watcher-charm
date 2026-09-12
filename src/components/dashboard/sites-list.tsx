import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatRelative, healthScore, type WebsiteRow } from "@/lib/monitor-data";

const statusConfig: Record<
  string,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  active: {
    label: "Active",
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  },
  scanning: {
    label: "Scanning",
    icon: Loader2,
    className: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  },
  error: {
    label: "Error",
    icon: AlertTriangle,
    className: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400",
  },
};

export function SitesList({
  sites,
  selected,
  onSelect,
  onRescan,
  onDelete,
  busyId,
}: {
  sites: WebsiteRow[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onRescan: (domain: string) => void;
  onDelete: (id: string) => void;
  busyId: string | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Monitored Websites</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
            selected === null && "border-primary bg-accent",
          )}
        >
          <span className="font-medium">All sites</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {sites.length} domain{sites.length === 1 ? "" : "s"}
          </span>
        </button>

        {sites.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No sites yet. Scan a domain to start monitoring it.
          </p>
        )}

        {sites.map((site) => {
          const cfg = statusConfig[site.status] ?? statusConfig["active"]!;
          const Icon = cfg.icon;
          const score = healthScore(site.broken_count);
          const busy = busyId === site.id || site.status === "scanning";
          return (
            <div
              key={site.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(selected === site.id ? null : site.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelect(selected === site.id ? null : site.id);
              }}
              className={cn(
                "w-full cursor-pointer rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-accent",
                selected === site.id && "border-primary bg-accent",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{site.domain}</span>
                <Badge variant="outline" className={cn("shrink-0 gap-1", cfg.className)}>
                  <Icon className={cn("h-3 w-3", busy && "animate-spin")} />
                  {busy ? "Scanning" : cfg.label}
                </Badge>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Progress value={score} className="h-1.5 flex-1" />
                <span className="text-xs tabular-nums text-muted-foreground">{score}%</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>{site.broken_count} broken links</span>
                <span>Scanned {formatRelative(site.last_scanned_at)}</span>
              </div>
              <div className="mt-2 flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRescan(site.domain);
                  }}
                >
                  <RefreshCw className={cn("mr-1 h-3 w-3", busy && "animate-spin")} />
                  Re-scan
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(site.id);
                  }}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
