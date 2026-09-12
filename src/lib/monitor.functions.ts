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
}

export const listSeoIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SeoIssueRow[]> => {
    const { data, error } = await context.supabase
      .from("seo_issues")
      .select("id, website_id, type, url, severity, message, detail, detected_at, websites(domain)")
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
        "id, website_id, source_url, target_url, anchor_text, http_status, error_type, detected_at, replacement_url, fixed_at, websites(domain)",
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

    try {
      const result = await crawlSite(data.domain);

      await supabase.from("broken_links").delete().eq("website_id", site.id);
      await supabase.from("seo_issues").delete().eq("website_id", site.id);

      if (result.seoIssues.length > 0) {
        const { error: seoError } = await supabase.from("seo_issues").insert(
          result.seoIssues.map((issue) => ({
            website_id: site.id,
            type: issue.type,
            url: issue.url,
            severity: issue.severity,
            message: issue.message,
            detail: issue.detail,
          })),
        );
        if (seoError) throw new Error(seoError.message);
      }

      if (result.broken.length > 0) {
        const { error: insertError } = await supabase.from("broken_links").insert(
          result.broken.map((link) => ({
            website_id: site.id,
            source_url: link.sourceUrl,
            target_url: link.targetUrl,
            anchor_text: link.anchorText,
            http_status: link.httpStatus,
            error_type: link.errorType,
          })),
        );
        if (insertError) throw new Error(insertError.message);
      }

      await supabase
        .from("websites")
        .update({
          status: "active",
          last_scanned_at: new Date().toISOString(),
          pages_scanned: result.pagesScanned,
        })
        .eq("id", site.id);

      return {
        websiteId: site.id,
        domain: site.domain,
        pagesScanned: result.pagesScanned,
        linksChecked: result.linksChecked,
        brokenCount: result.broken.length,
      };
    } catch (error) {
      await supabase
        .from("websites")
        .update({ status: "error", last_scanned_at: new Date().toISOString() })
        .eq("id", site.id);
      throw new Error(error instanceof Error ? error.message : "Scan failed. Please try again.");
    }
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
    const { error } = await context.supabase
      .from("broken_links")
      .update({
        replacement_url: data.replacementUrl,
        fixed_at: new Date().toISOString(),
      })
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
