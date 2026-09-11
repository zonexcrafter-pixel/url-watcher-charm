import { Activity, Globe2, Link2Off, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonitoredSite } from "@/lib/monitor-data";

export function StatCards({ sites }: { sites: MonitoredSite[] }) {
  const totalSites = sites.length;
  const activeBroken = sites.reduce((sum, s) => sum + s.brokenLinks, 0);
  const avgHealth = Math.round(
    sites.reduce((sum, s) => sum + s.healthScore, 0) / Math.max(1, totalSites),
  );

  const stats = [
    {
      title: "Monitored Sites",
      value: totalSites.toString(),
      icon: Globe2,
      hint: "2 added this month",
    },
    {
      title: "Active Broken Links",
      value: activeBroken.toString(),
      icon: Link2Off,
      hint: "-6 since last week",
    },
    {
      title: "Avg. Site Health",
      value: `${avgHealth}%`,
      icon: Activity,
      hint: "Across all properties",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{stat.value}</div>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              {stat.hint}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
