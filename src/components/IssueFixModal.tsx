import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BrokenLinkRow, SeoIssueRow } from "@/lib/monitor.functions";
import {
  seoProblemCopy,
  suggestReplacementUrl,
  suggestSeoFix,
  type FixSuggestion,
} from "@/lib/fixSuggestions";
import { ERROR_TYPE_LABELS } from "@/lib/monitor-data";

export type IssueFixTarget =
  | { kind: "link"; link: BrokenLinkRow }
  | { kind: "seo"; issue: SeoIssueRow };

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

  const suggestion: FixSuggestion | null = useMemo(() => {
    if (!target) return null;
    return target.kind === "link"
      ? suggestReplacementUrl(target.link, candidateUrls)
      : suggestSeoFix(target.issue);
  }, [target, candidateUrls]);

  useEffect(() => {
    setEditing(false);
    setError(null);
    setValue(suggestion?.value ?? "");
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

  async function applyFix() {
    if (!target) return;
    if (target.kind === "link") {
      setSaving(true);
      setError(null);
      try {
        await onApplyLinkFix(target.link.id, value.trim());
        onOpenChange(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the replacement link");
      } finally {
        setSaving(false);
      }
      return;
    }
    // SEO copy fixes are applied in the site's own CMS/template — hand the user
    // the finished text and clear the issue from the queue.
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard unavailable — the value is still visible in the box */
    }
    onIgnore(target);
    onOpenChange(false);
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

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Action controls */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              disabled={saving || value.trim().length === 0}
              onClick={() => void applyFix()}
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
