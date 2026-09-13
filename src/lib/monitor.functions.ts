import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DOMAIN_RE = /^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}(?::\d{1,5})?$/;

export interface WebsiteRow {
  id: string;
  domain: string;
  status: string;
  last_scanned_at: string | null;
  pages_scanned: number;
  created_at: string;
  broken_count: number;
}

/** Lifecycle of an issue, from first detection through automated verification. */
export type IssueState =
  "detected" | "suggested" | "fix_proposed" | "fixed" | "verified" | "ignored";

export const ISSUE_STATES: IssueState[] = [
  "detected",
  "suggested",
  "fix_proposed",
  "fixed",
  "verified",
  "ignored",
];

export interface BrokenLinkRow {
  id: string;
  website_id: string;
  domain: string;
  source_url: string;
  target_url: string;
  anchor_text: string | null;
  http_status: number | null;
  error_type: string;
  detected_at: string;
  replacement_url: string | null;
  fixed_at: string | null;
  issue_state: IssueState;
  state_updated_at: string;
  verified_at: string | null;
  verified_status: number | null;
  is_redirect: boolean;
  redirect_target: string | null;
}

export interface SeoIssueRow {
  id: string;
  website_id: string;
  domain: string;
  type: string;
  url: string;
  severity: "error" | "warning";
  message: string;
  detail: string | null;
  detected_at: string;
  issue_state: IssueState;
  state_updated_at: string;
  verified_at: string | null;
}

export const listSeoIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SeoIssueRow[]> => {
    const { data, error } = await context.supabase
      .from("seo_issues")
      .select(
        "id, website_id, type, url, severity, message, detail, detected_at, issue_state, state_updated_at, verified_at, websites(domain)",
      )
      .order("detected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const { websites, ...rest } = row as typeof row & {
        websites: { domain: string } | null;
      };
      return { ...rest, domain: websites?.domain ?? "" } as SeoIssueRow;
    });
  });

export const listWebsites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WebsiteRow[]> => {
    const { data, error } = await context.supabase
      .from("websites")
      .select("id, domain, status, last_scanned_at, pages_scanned, created_at, broken_links(id)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const { broken_links, ...rest } = row as typeof row & {
        broken_links: { id: string }[] | null;
      };
      return { ...rest, broken_count: broken_links?.length ?? 0 } as WebsiteRow;
    });
  });

export const listBrokenLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrokenLinkRow[]> => {
    const { data, error } = await context.supabase
      .from("broken_links")
      .select(
        "id, website_id, source_url, target_url, anchor_text, http_status, error_type, detected_at, replacement_url, fixed_at, issue_state, state_updated_at, verified_at, verified_status, is_redirect, redirect_target, websites(domain)",
      )
      .order("detected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const { websites, ...rest } = row as typeof row & {
        websites: { domain: string } | null;
      };
      return { ...rest, domain: websites?.domain ?? "" } as BrokenLinkRow;
    });
  });

/** Crawl a domain live and persist every broken link that is found. */
export const scanWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { domain: string }) => {
    const domain = String(input?.domain ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    if (!DOMAIN_RE.test(domain)) {
      throw new Error("Enter a valid domain, for example example.com");
    }
    return { domain };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { crawlSite } = await import("./crawler.server");

    const { data: site, error: siteError } = await supabase
      .from("websites")
      .upsert(
        { user_id: userId, domain: data.domain, status: "scanning" },
        { onConflict: "user_id,domain" },
      )
      .select("id, domain")
      .single();
    if (siteError || !site) throw new Error(siteError?.message ?? "Could not save website");

    // Every scan run is its own row; pages/links/issues hang off it.
    const { data: scan, error: scanError } = await supabase
      .from("scans")
      .insert({ website_id: site.id, status: "running" })
      .select("id")
      .single();
    if (scanError || !scan) throw new Error(scanError?.message ?? "Could not start scan");

    try {
      const result = await crawlSite(data.domain);

      // Replace the previous truth for this site with this run's findings.
      await supabase.from("broken_links").delete().eq("website_id", site.id);
      await supabase.from("seo_issues").delete().eq("website_id", site.id);
      await supabase.from("pages").delete().eq("website_id", site.id);

      if (result.pages.length > 0) {
        const { error: pageError } = await supabase.from("pages").insert(
          result.pages.map((page) => ({
            scan_id: scan.id,
            website_id: site.id,
            url: page.url,
            http_status: page.httpStatus,
            response_time_ms: page.responseTimeMs,
            title: page.title,
            meta_description: page.metaDescription,
            h1_count: page.h1Count,
            canonical_url: page.canonicalUrl,
            is_allowed_by_robots: page.isAllowedByRobots,
            redirected_to: page.redirectedTo,
            redirect_count: page.redirectCount,
            error_message: page.errorMessage,
          })),
        );
        if (pageError) throw new Error(pageError.message);
      }

      if (result.seoIssues.length > 0) {
        const { error: seoError } = await supabase.from("seo_issues").insert(
          result.seoIssues.map((issue) => ({
            website_id: site.id,
            scan_id: scan.id,
            type: issue.type,
            url: issue.url,
            severity: issue.severity,
            message: issue.message,
            detail: issue.detail,
          })),
        );
        if (seoError) throw new Error(seoError.message);
      }

      // Hard link errors and 30x redirects are stored together but flagged apart.
      const linkRows = [...result.broken, ...result.redirects].map((link) => ({
        website_id: site.id,
        scan_id: scan.id,
        source_url: link.sourceUrl,
        target_url: link.targetUrl,
        anchor_text: link.anchorText,
        http_status: link.httpStatus,
        error_type: link.errorType,
        is_redirect: link.isRedirect,
        redirect_target: link.redirectTarget,
      }));
      if (linkRows.length > 0) {
        const { error: insertError } = await supabase.from("broken_links").insert(linkRows);
        if (insertError) throw new Error(insertError.message);
      }

      const finishedAt = new Date().toISOString();
      await supabase
        .from("scans")
        .update({
          status: "complete",
          pages_scanned: result.pagesScanned,
          links_checked: result.linksChecked,
          broken_count: result.broken.length,
          seo_issue_count: result.seoIssues.length,
          finished_at: finishedAt,
        })
        .eq("id", scan.id);

      await supabase
        .from("websites")
        .update({
          status: "active",
          last_scanned_at: finishedAt,
          pages_scanned: result.pagesScanned,
        })
        .eq("id", site.id);

      return {
        websiteId: site.id,
        scanId: scan.id,
        domain: site.domain,
        pagesScanned: result.pagesScanned,
        linksChecked: result.linksChecked,
        brokenCount: result.broken.length,
        redirectCount: result.redirects.length,
        seoIssueCount: result.seoIssues.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan failed. Please try again.";
      await supabase
        .from("scans")
        .update({ status: "error", error_message: message, finished_at: new Date().toISOString() })
        .eq("id", scan.id);
      await supabase
        .from("websites")
        .update({ status: "error", last_scanned_at: new Date().toISOString() })
        .eq("id", site.id);
      throw new Error(message);
    }
  });

export interface PageRow {
  id: string;
  website_id: string;
  url: string;
  http_status: number | null;
  response_time_ms: number | null;
  title: string | null;
  meta_description: string | null;
  h1_count: number | null;
  canonical_url: string | null;
  redirected_to: string | null;
  redirect_count: number;
  is_allowed_by_robots: boolean;
  error_message: string | null;
  created_at: string;
}

/** Every page recorded by the most recent crawl, newest first. */
export const listPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PageRow[]> => {
    const { data, error } = await context.supabase
      .from("pages")
      .select(
        "id, website_id, url, http_status, response_time_ms, title, meta_description, h1_count, canonical_url, redirected_to, redirect_count, is_allowed_by_robots, error_message, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as PageRow[];
  });

export const deleteBrokenLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("broken_links").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Re-test one broken link. Removes the row when the URL is healthy again. */
export const recheckBrokenLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    const { recheckUrl } = await import("./crawler.server");
    const { data: row, error } = await context.supabase
      .from("broken_links")
      .select("id, target_url")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Link not found");

    const result = await recheckUrl(row.target_url);
    if (!result) {
      await context.supabase.from("broken_links").delete().eq("id", row.id);
      return { fixed: true, httpStatus: null as number | null };
    }
    await context.supabase
      .from("broken_links")
      .update({
        http_status: result.httpStatus,
        error_type: result.errorType,
        detected_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { fixed: false, httpStatus: result.httpStatus };
  });

/** Save a replacement URL for a broken link and mark it as fixed/redirected. */
export const fixBrokenLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; replacementUrl: string }) => {
    const id = String(input?.id ?? "");
    const replacementUrl = String(input?.replacementUrl ?? "").trim();
    if (!/^https?:\/\/\S+$/i.test(replacementUrl)) {
      throw new Error("Enter a full URL starting with http:// or https://");
    }
    return { id, replacementUrl };
  })
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("broken_links")
      .update({
        replacement_url: data.replacementUrl,
        fixed_at: now,
        issue_state: "fixed",
        state_updated_at: now,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Verification engine: re-test the replacement URL right away.
    const { recheckUrl } = await import("./crawler.server");
    const failure = await recheckUrl(data.replacementUrl);
    if (failure) {
      return { ok: true, verified: false, httpStatus: failure.httpStatus };
    }

    const verifiedAt = new Date().toISOString();
    await context.supabase
      .from("broken_links")
      .update({
        issue_state: "verified",
        state_updated_at: verifiedAt,
        verified_at: verifiedAt,
        verified_status: 200,
      })
      .eq("id", data.id);
    return { ok: true, verified: true, httpStatus: 200 };
  });

/** Move an issue to a new lifecycle state (e.g. suggested, fix_proposed, ignored). */
export const setIssueState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; kind: "link" | "seo"; state: IssueState }) => {
    const id = String(input?.id ?? "");
    const kind = input?.kind === "seo" ? ("seo" as const) : ("link" as const);
    const state = input?.state;
    if (!ISSUE_STATES.includes(state)) throw new Error("Unknown issue state");
    return { id, kind, state };
  })
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const table = data.kind === "seo" ? "seo_issues" : "broken_links";
    const { error } = await context.supabase
      .from(table)
      .update({ issue_state: data.state, state_updated_at: now })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("websites").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSeoIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("seo_issues").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
