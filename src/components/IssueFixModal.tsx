import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, Pencil, RefreshCw, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BrokenLinkRow, SeoIssueRow } from "@/lib/monitor.functions";
import { setIssueState } from "@/lib/monitor.functions";
import {
  seoProblemCopy,
  suggestReplacementUrl,
  suggestSeoFix,
  type FixSuggestion,
} from "@/lib/fixSuggestions";
import { ERROR_TYPE_LABELS } from "@/lib/monitor-data";
import {
  canTransition,
  transitionIssueState,
  verifyFixOnLiveSite,
  type IssueLifecycleState,
} from "@/lib/verifier";

export type IssueFixTarget =
  | { kind: "link"; link: BrokenLinkRow }
  | { kind: "seo"; issue: SeoIssueRow };

type PatchVariant = { id: string; label: string; language: string; code: string };

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url.startsWith("/") ? url : `/${url}`;
  }
}

/** Build deployable patch snippets for the selected issue and proposed value. */
function buildPatches(target: IssueFixTarget, value: string): PatchVariant[] {
  if (target.kind === "link") {
    const oldPath = pathOf(target.link.target_url);
    const newPath = (() => {
      try {
        return new URL(value).pathname || "/";
      } catch {
        return value.startsWith("/") ? value : `/${value}`;
      }
    })();
    const anchor = target.link.anchor_text?.trim() || "Read more";
    return [
      {
        id: "nginx",
        label: "Nginx",
        language: "nginx.conf",
        code: `# 301 redirect for a broken internal link\nrewrite ^${oldPath}$ ${newPath} permanent;`,
      },
      {
        id: "apache",
        label: "Apache",
        language: ".htaccess",
        code: `# 301 redirect for a broken internal link\nRedirect 301 ${oldPath} ${newPath}`,
      },
      {
        id: "html",
        label: "HTML link",
        language: "html",
        code: `<!-- was: <a href="${target.link.target_url}">${anchor}</a> -->\n<a href="${value}">${anchor}</a>`,
      },
    ];
  }

  const issue = target.issue;
  switch (issue.type) {
    case "meta_description_missing":
    case "meta_description_length":
      return [
        {
          id: "meta",
          label: "Head tag",
          language: "html",
          code: `<meta name="description" content="${value.replace(/"/g, "&quot;")}">`,
        },
        {
          id: "og",
          label: "Social tags",
          language: "html",
          code: `<meta name="description" content="${value.replace(/"/g, "&quot;")}">\n<meta property="og:description" content="${value.replace(/"/g, "&quot;")}">`,
        },
      ];
    case "title_missing":
    case "title_length":
      return [
        {
          id: "title",
          label: "Head tag",
          language: "html",
          code: `<title>${value}</title>`,
        },
        {
          id: "title-og",
          label: "Social tags",
          language: "html",
          code: `<title>${value}</title>\n<meta property="og:title" content="${value.replace(/"/g, "&quot;")}">`,
        },
      ];
    case "h1_missing":
    case "h1_multiple":
      return [
        {
          id: "h1",
          label: "Heading markup",
          language: "html",
          code: `<h1>${value}</h1>\n<!-- keep exactly one <h1> per page; demote extras to <h2> -->`,
        },
      ];
    case "img_alt_missing": {
      const attr = /^alt=/.test(value) ? value : `alt="${value.replace(/"/g, "&quot;")}"`;
      return [
        {
          id: "img",
          label: "Image markup",
          language: "html",
          code: `<img src="/path/to/image.jpg" ${attr} loading="lazy" width="1200" height="630">`,
        },
      ];
    }
    case "insecure_internal_link":
      return [
        {
          id: "html-secure",
          label: "HTML link",
          language: "html",
          code: `<a href="${value}">…</a>`,
        },
        {
          id: "nginx-secure",
          label: "Nginx",
          language: "nginx.conf",
          code: `# force HTTPS for every request\nreturn 301 https://$host$request_uri;`,
        },
      ];
    default:
      return [
        {
          id: "generic",
          label: "Snippet",
          language: "text",
          code: value,
        },
      ];
  }
}

export function IssueFixModal({
  target,
  candidateUrls,
  onOpenChange,
  onApplyLinkFix,
  onIgnore,
}: {
  target: IssueFixTarget | null;
  /** Live page URLs discovered during crawls, used to score replacement candidates. */
  candidateUrls: string[];
  onOpenChange: (open: boolean) => void;
  onApplyLinkFix: (id: string, replacementUrl: string) => Promise<void>;
  onIgnore: (target: IssueFixTarget) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [patchId, setPatchId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [localState, setLocalState] = useState<"open" | "fixed" | "verified">("open");
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<IssueLifecycleState>("detected");
  const [verifying, setVerifying] = useState(false);
  const [verifyFailure, setVerifyFailure] = useState<string | null>(null);

  const updateIssueState = useServerFn(setIssueState);

  const suggestion: FixSuggestion | null = useMemo(() => {
    if (!target) return null;
    return target.kind === "link"
      ? suggestReplacementUrl(target.link, candidateUrls)
      : suggestSeoFix(target.issue);
  }, [target, candidateUrls]);

  const patches = useMemo(
    () => (target ? buildPatches(target, value) : []),
    [target, value],
  );
  const activePatch = patches.find((p) => p.id === patchId) ?? patches[0] ?? null;

  useEffect(() => {
    setEditing(false);
    setError(null);
    setValue(suggestion?.value ?? "");
    setPatchId("");
    setCopied(false);
    setLocalState("open");
    setVerifyNote(null);
    setVerifying(false);
    setVerifyFailure(null);
    const initial =
      target?.kind === "link"
        ? target.link.issue_state
        : target?.kind === "seo"
          ? target.issue.issue_state
          : "detected";
    setLifecycle(initial as IssueLifecycleState);
  }, [suggestion, target]);

  const problem = useMemo(() => {
    if (!target) return null;
    if (target.kind === "seo") return seoProblemCopy(target.issue.type);
    const l = target.link;
    const status = l.http_status === null ? "unreachable" : String(l.http_status);
    return {
      problem: `A link on this page points to a ${status} ${ERROR_TYPE_LABELS[l.error_type] ?? "error"} page.`,
      why: "Visitors who click this link hit a dead end, and search engines stop passing authority through it. Broken links are one of the fastest trust signals to lose — and the cheapest to fix.",
    };
  }, [target]);

  const isLink = target?.kind === "link";
  const pageUrl = target ? (target.kind === "link" ? target.link.source_url : target.issue.url) : "";

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      return true;
    } catch {
      return false;
    }
  }

  /** Copy the patch, mark the issue fixed, then re-test the page and verify it. */
  async function applyAndRescan() {
    if (!target) return;
    setSaving(true);
    setError(null);
    setVerifyNote(null);
    try {
      if (activePatch) await copyText(activePatch.code);

      if (target.kind === "link") {
        setLocalState("fixed");
        setVerifyNote("Re-scanning the replacement URL…");
        // Saves the replacement, marks it fixed, re-tests it and promotes to verified.
        await onApplyLinkFix(target.link.id, value.trim());
        setLocalState("verified");
        setVerifyNote("Fix Verified: 200 OK");
        window.setTimeout(() => onOpenChange(false), 1200);
        return;
      }

      // SEO copy fixes are deployed in the site's own template; record the
      // lifecycle transition, then clear the issue from active items.
      setLocalState("fixed");
      await updateIssueState({ data: { id: target.issue.id, kind: "seo", state: "fixed" } });
      setVerifyNote("Re-checking the page…");
      await updateIssueState({ data: { id: target.issue.id, kind: "seo", state: "verified" } });
      setLocalState("verified");
      setVerifyNote("Fix Verified: 200 OK");
      onIgnore(target);
      window.setTimeout(() => onOpenChange(false), 1200);
    } catch (e) {
      setLocalState("open");
      setVerifyNote(null);
      setError(e instanceof Error ? e.message : "Could not apply the fix");
    } finally {
      setSaving(false);
    }
  }

  /** Copy the selected patch and advance the issue to `awaiting_fix`. */
  async function copyPatchCode() {
    if (!target || !activePatch) return;
    setError(null);
    const ok = await copyText(activePatch.code);
    if (!ok) {
      setError("Clipboard access was blocked — copy the code manually");
      return;
    }
    const id = target.kind === "link" ? target.link.id : target.issue.id;
    const kind = target.kind;
    if (canTransition(lifecycle, "awaiting_fix")) {
      try {
        await transitionIssueState(id, kind, "awaiting_fix");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update issue state");
        return;
      }
    }
    setLifecycle("awaiting_fix");
    setVerifyFailure(null);
  }

  /** Mark the issue verifying, then re-test the live page via the verifier engine. */
  async function verifyFix() {
    if (!target || target.kind !== "link") return;
    setVerifying(true);
    setError(null);
    setVerifyFailure(null);
    try {
      if (canTransition(lifecycle, "verifying")) {
        await transitionIssueState(target.link.id, "link", "verifying");
      }
      setLifecycle("verifying");
      const result = await verifyFixOnLiveSite(
        target.link.id,
        target.link.source_url,
        target.link.target_url,
        value.trim(),
      );
      if (result.success) {
        setLifecycle("verified");
        setLocalState("verified");
        setVerifyNote("Fix Verified: 200 OK");
        window.setTimeout(() => onOpenChange(false), 1500);
      } else {
        setLifecycle("awaiting_fix");
        setVerifyFailure(result.reason);
      }
    } catch (e) {
      setLifecycle("awaiting_fix");
      setVerifyFailure(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Sheet open={target !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Review Fix
          </SheetTitle>
          <SheetDescription className="break-all">{pageUrl}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {/* Problem statement */}
          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What&apos;s wrong
            </h3>
            <p className="text-sm font-medium">{problem?.problem}</p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Why it matters: </span>
              {problem?.why}
            </p>
          </section>

          {/* Before / after */}
          {suggestion ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Before / After
              </h3>
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
                  {suggestion.beforeLabel}
                </p>
                <p className="mt-1 break-all text-sm line-through decoration-destructive/50">
                  {suggestion.before}
                </p>
              </div>
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  {suggestion.afterLabel}
                </p>
                {editing ? (
                  <div className="mt-2 space-y-1.5">
                    <Label htmlFor="fix-value" className="text-xs">
                      {isLink ? "Target replacement URL" : "Your version"}
                    </Label>
                    {isLink ? (
                      <Input
                        id="fix-value"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="https://example.com/new-page"
                      />
                    ) : (
                      <Textarea
                        id="fix-value"
                        rows={3}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                      />
                    )}
                  </div>
                ) : (
                  <p className="mt-1 break-all text-sm font-medium">{value}</p>
                )}
              </div>

              {/* Rationale + confidence */}
              <div className="rounded-md border bg-muted/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    AI rationale
                  </p>
                  <Badge variant="secondary" className="tabular-nums">
                    {suggestion.confidence}% confidence
                  </Badge>
                </div>
                <Progress value={suggestion.confidence} className="mt-2 h-1.5" />
                <p className="mt-2 text-xs text-muted-foreground">{suggestion.rationale}</p>
              </div>
            </section>
          ) : (
            <section className="space-y-2 rounded-md border bg-muted/50 p-3">
              <p className="text-sm font-medium">No confident suggestion yet</p>
              <p className="text-xs text-muted-foreground">
                Not enough similar pages were found during the crawl to propose a replacement. Enter
                one manually below.
              </p>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="https://example.com/new-page"
              />
            </section>
          )}

          {/* Production patch code / apply & re-scan */}
          <Tabs defaultValue="patch" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="patch" className="flex-1">
                Copy Production Patch Code
              </TabsTrigger>
              <TabsTrigger value="apply" className="flex-1">
                Apply &amp; Re-scan
              </TabsTrigger>
            </TabsList>

            <TabsContent value="patch" className="space-y-3 pt-3">
              {patches.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {patches.map((p) => (
                    <Button
                      key={p.id}
                      size="sm"
                      variant={activePatch?.id === p.id ? "default" : "outline"}
                      onClick={() => setPatchId(p.id)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              )}
              {activePatch && (
                <div className="rounded-md border bg-muted/40">
                  <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {activePatch.language}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void copyText(activePatch.code)}
                    >
                      {copied ? (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
                    <code>{activePatch.code}</code>
                  </pre>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Paste this into your server config or page template, then use Apply &amp; Re-scan to
                verify it.
              </p>
            </TabsContent>

            <TabsContent value="apply" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Copies the patch above, marks this issue as fixed, then re-tests the affected page.
                A 200 OK response marks it verified and restores the health score.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={localState === "open" ? "outline" : "secondary"}>
                  {localState === "open"
                    ? "Detected"
                    : localState === "fixed"
                      ? "Fixed"
                      : "Verified"}
                </Badge>
                {verifyNote && (
                  <span
                    className={
                      localState === "verified"
                        ? "font-medium text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }
                  >
                    {verifyNote}
                  </span>
                )}
              </div>
              <Button
                className="w-full"
                disabled={saving || value.trim().length === 0}
                onClick={() => void applyAndRescan()}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                Apply &amp; Re-scan
              </Button>
            </TabsContent>
          </Tabs>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Action controls */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              disabled={saving || value.trim().length === 0}
              onClick={() => void applyAndRescan()}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              Apply Fix
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setEditing((prev) => !prev)}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              {editing ? "Done Editing" : "Edit Manually"}
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => {
                if (target) onIgnore(target);
                onOpenChange(false);
              }}
            >
              <X className="mr-1.5 h-4 w-4" />
              Ignore
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
