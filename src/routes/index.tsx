import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link2Off, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCards } from "@/components/dashboard/stat-cards";
import { ScanDialog } from "@/components/dashboard/scan-dialog";
import { BrokenLinksTable } from "@/components/dashboard/broken-links-table";
import { SitesList } from "@/components/dashboard/sites-list";
import { monitoredSites, type MonitoredSite } from "@/lib/monitor-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LinkWatch — Broken Link Monitoring Dashboard" },
      {
        name: "description",
        content:
          "Monitor your websites for broken links. Track 404s, server errors, and site health across all your domains in real time.",
      },
      { property: "og:title", content: "LinkWatch — Broken Link Monitoring Dashboard" },
      {
        property: "og:description",
        content:
          "Monitor your websites for broken links. Track 404s, server errors, and site health across all your domains in real time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [sites, setSites] = useState<MonitoredSite[]>(monitoredSites);
  const [scanOpen, setScanOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  const selectedDomain = useMemo(
    () => sites.find((s) => s.id === selectedSite)?.domain ?? null,
    [sites, selectedSite],
  );

  function handleScanComplete(domain: string) {
    setSites((prev) => {
      if (prev.some((s) => s.domain === domain)) return prev;
      return [
        {
          id: `site-${Date.now()}`,
          domain,
          status: "active" as const,
          lastScanned: new Date().toISOString(),
          pagesScanned: 23,
          brokenLinks: 2,
          healthScore: 92,
        },
        ...prev,
      ];
    });
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Link2Off className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">LinkWatch</span>
          </div>
          <Button onClick={() => setScanOpen(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Scan new site
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Broken link monitoring across all your properties.
          </p>
        </div>

        <StatCards sites={sites} />

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <SitesList sites={sites} selected={selectedSite} onSelect={setSelectedSite} />
          <BrokenLinksTable domainFilter={selectedDomain} />
        </div>
      </main>

      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onScanStarted={handleScanComplete}
      />
    </div>
  );
}
