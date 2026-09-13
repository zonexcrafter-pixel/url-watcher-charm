import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2Off, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatCards } from "@/components/dashboard/stat-cards";
import { ScanDialog } from "@/components/dashboard/scan-dialog";
import { BrokenLinksTable } from "@/components/dashboard/broken-links-table";
import { SitesList } from "@/components/dashboard/sites-list";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteBrokenLink,
  deleteSeoIssue,
  deleteWebsite,
  fixBrokenLink,
  listBrokenLinks,
  listSeoIssues,
  listWebsites,
  recheckBrokenLink,
  scanWebsite,
} from "@/lib/monitor.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LinkWatch — Broken Link Monitoring Dashboard" },
      {
        name: "description",
        content:
          "Scan your websites for broken links. Track 404s, server errors, and site health across all your domains in real time.",
      },
      { property: "og:title", content: "LinkWatch — Broken Link Monitoring Dashboard" },
      {
        property: "og:description",
        content:
          "Scan your websites for broken links. Track 404s, server errors, and site health across all your domains.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [scanOpen, setScanOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);
  const [busySiteId, setBusySiteId] = useState<string | null>(null);

  const fetchWebsites = useServerFn(listWebsites);
  const fetchLinks = useServerFn(listBrokenLinks);
  const fetchSeoIssues = useServerFn(listSeoIssues);
  const runScan = useServerFn(scanWebsite);
  const removeLink = useServerFn(deleteBrokenLink);
  const recheckLink = useServerFn(recheckBrokenLink);
  const removeSite = useServerFn(deleteWebsite);
  const fixLink = useServerFn(fixBrokenLink);
  const removeSeoIssue = useServerFn(deleteSeoIssue);

  async function handleFixLink(id: string, replacementUrl: string) {
    const result = await fixLink({ data: { id, replacementUrl } });
    if (result.verified) {
      toast.success("Fix Verified: 200 OK", {
        description: "Health score updated — issue cleared from active problems.",
      });
    } else {
      toast.warning("Replacement saved, but not verified", {
        description: `The new URL returned ${result.httpStatus ?? "no response"}.`,
      });
    }
    refresh();
  }

  const sitesQuery = useQuery({
    queryKey: ["websites"],
    queryFn: () => fetchWebsites(),
    enabled: !!user,
  });
  const linksQuery = useQuery({
    queryKey: ["broken-links"],
    queryFn: () => fetchLinks(),
    enabled: !!user,
  });
  const seoIssuesQuery = useQuery({
    queryKey: ["seo-issues"],
    queryFn: () => fetchSeoIssues(),
    enabled: !!user,
  });

  const sites = sitesQuery.data ?? [];
  const links = linksQuery.data ?? [];
  const seoIssues = seoIssuesQuery.data ?? [];

  const selectedDomain = useMemo(
    () => (sitesQuery.data ?? []).find((s) => s.id === selectedSite)?.domain ?? null,
    [sitesQuery.data, selectedSite],
  );

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["websites"] });
    void queryClient.invalidateQueries({ queryKey: ["broken-links"] });
    void queryClient.invalidateQueries({ queryKey: ["seo-issues"] });
  }

  const scanMutation = useMutation({
    mutationFn: (domain: string) => runScan({ data: { domain } }),
    onSuccess: (result) => {
      toast.success(`Scan complete for ${result.domain}`, {
        description: `${result.pagesScanned} pages crawled, ${result.linksChecked} links checked, ${result.brokenCount} broken.`,
      });
      refresh();
    },
  });

  async function handleDeleteLink(id: string) {
    setBusyLinkId(id);
    try {
      await removeLink({ data: { id } });
      toast.success("Broken link deleted");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete link");
    } finally {
      setBusyLinkId(null);
    }
  }

  async function handleRecheckLink(id: string) {
    setBusyLinkId(id);
    try {
      const result = await recheckLink({ data: { id } });
      if (result.fixed) {
        toast.success("Link is working again — removed from the list");
      } else {
        toast.info(`Still broken (${result.httpStatus ?? "unreachable"})`);
      }
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not re-check link");
    } finally {
      setBusyLinkId(null);
    }
  }

  async function handleRescan(domain: string) {
    const site = sites.find((s) => s.domain === domain);
    setBusySiteId(site?.id ?? null);
    try {
      await scanMutation.mutateAsync(domain);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setBusySiteId(null);
    }
  }

  async function handleDeleteSite(id: string) {
    try {
      await removeSite({ data: { id } });
      if (selectedSite === id) setSelectedSite(null);
      toast.success("Site removed from monitoring");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove site");
    }
  }

  async function handleDeleteSeoIssue(id: string) {
    setBusyLinkId(id);
    try {
      await removeSeoIssue({ data: { id } });
      toast.success("SEO issue dismissed");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not dismiss issue");
    } finally {
      setBusyLinkId(null);
    }
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
          {user ? (
            <div className="flex items-center gap-2">
              <Button onClick={() => setScanOpen(true)} size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Scan new site
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await supabase.auth.signOut();
                  queryClient.clear();
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live broken link monitoring across all your properties.
          </p>
        </div>

        {!user && !authLoading ? (
          <div className="rounded-lg border bg-background p-10 text-center">
            <h2 className="text-lg font-semibold">Sign in to start monitoring</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Create an account to scan your domains, store results, and track broken links over
              time.
            </p>
            <Button asChild className="mt-4">
              <Link to="/auth">Sign in or create an account</Link>
            </Button>
          </div>
        ) : (
          <>
            <StatCards links={links} seoIssues={seoIssues} />

            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <SitesList
                sites={sites}
                selected={selectedSite}
                onSelect={setSelectedSite}
                onRescan={(domain) => void handleRescan(domain)}
                onDelete={(id) => void handleDeleteSite(id)}
                busyId={busySiteId}
              />
              <BrokenLinksTable
                links={links}
                seoIssues={seoIssues}
                loading={linksQuery.isLoading || seoIssuesQuery.isLoading || authLoading}
                domainFilter={selectedDomain}
                onDelete={(id) => void handleDeleteLink(id)}
                onRecheck={(id) => void handleRecheckLink(id)}
                onFix={handleFixLink}
                onDeleteSeoIssue={(id) => void handleDeleteSeoIssue(id)}
                busyId={busyLinkId}
              />
            </div>
          </>
        )}
      </main>

      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onScan={async (domain) => {
          await scanMutation.mutateAsync(domain);
        }}
      />
    </div>
  );
}
