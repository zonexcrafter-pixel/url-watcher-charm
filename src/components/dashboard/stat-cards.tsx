import { AlertOctagon, AlertTriangle, Activity, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BrokenLinkRow, SeoIssueRow } from "@/lib/monitor.functions";
import { calculateHealthScore } from "@/lib/healthScore";

export function StatCards({
  links,
  seoIssues,
}: {
  links: BrokenLinkRow[];
  seoIssues: SeoIssueRow[];
}) {
  const health = calculateHealthScore(links, seoIssues);
  const critical = health.counts.critical;
  const warnings = health.counts.high + health.counts.medium;
  const opportunities = health.counts.low;

  const scoreColor =
    health.score >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : health.score >= 50
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400";

  const stats = [
    {
      title: "Health Score",
      value: `${health.score}`,
      suffix: "/100",
      icon: Activity,
      valueClass: scoreColor,
      hint: health.categories
        .filter((c) => c.openIssues > 0)
        .map((c) => `${c.category} −${c.deductions}`)
        .join(" · ") || "No open issues",
    },
    {
      title: "Critical",
      value: critical.toString(),
      icon: AlertOctagon,
      valueClass: critical > 0 ? "text-red-600 dark:text-red-400" : "",
      hint: "404s and severe failures",
    },
    {
      title: "Warnings",
      value: warnings.toString(),
      icon: AlertTriangle,
      valueClass: warnings > 0 ? "text-orange-600 dark:text-orange-400" : "",
      hint: "High & medium severity issues",
    },
    {
      title: "Opportunities",
      value: opportunities.toString(),
      icon: Lightbulb,
      valueClass: "",
      hint: "Low-effort quick wins",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold tabular-nums ${stat.valueClass}`}>
              {stat.value}
              {"suffix" in stat && stat.suffix && (
                <span className="text-base font-normal text-muted-foreground">{stat.suffix}</span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground" title={stat.hint}>
              {stat.hint}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
