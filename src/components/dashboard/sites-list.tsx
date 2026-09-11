import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatRelative, type MonitoredSite } from "@/lib/monitor-data";

const statusConfig = {
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
} as const;

export function SitesList({
  sites,
  selected,
  onSelect,
}: {
  sites: MonitoredSite[];
  selected: string | null;
  onSelect: (id: string | null) => void;
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
            {sites.length} domains
          </span>
        </button>

        {sites.map((site) => {
          const cfg = statusConfig[site.status];
          const Icon = cfg.icon;
          return (
            <button
              key={site.id}
              onClick={() => onSelect(selected === site.id ? null : site.id)}
              className={cn(
                "w-full rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-accent",
                selected === site.id && "border-primary bg-accent",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{site.domain}</span>
                <Badge variant="outline" className={cn("shrink-0 gap-1", cfg.className)}>
                  <Icon
                    className={cn(
                      "h-3 w-3",
                      site.status === "scanning" && "animate-spin",
                    )}
                  />
                  {cfg.label}
                </Badge>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Progress value={site.healthScore} className="h-1.5 flex-1" />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {site.healthScore}%
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>{site.brokenLinks} broken links</span>
                <span>Scanned {formatRelative(site.lastScanned)}</span>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
