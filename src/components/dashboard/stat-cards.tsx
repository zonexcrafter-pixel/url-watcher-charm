import { Activity, Globe2, Link2Off } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { healthScore, type WebsiteRow } from "@/lib/monitor-data";

export function StatCards({ sites }: { sites: WebsiteRow[] }) {
  const totalSites = sites.length;
  const activeBroken = sites.reduce((sum, s) => sum + s.broken_count, 0);
  const avgHealth = totalSites
    ? Math.round(
        sites.reduce((sum, s) => sum + healthScore(s.broken_count), 0) / totalSites,
      )
    : 100;

  const stats = [
    {
      title: "Monitored Sites",
      value: totalSites.toString(),
      icon: Globe2,
      hint: totalSites === 0 ? "Add your first site to begin" : "Live from your account",
    },
    {
      title: "Active Broken Links",
      value: activeBroken.toString(),
      icon: Link2Off,
      hint: "Detected on the latest scans",
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
            <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
