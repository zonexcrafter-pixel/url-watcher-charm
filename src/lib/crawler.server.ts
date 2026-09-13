/**
 * Server-only web crawler used by the scan server function.
 *
 * Responsibilities:
 *  - Validate every outbound URL (SSRF shield) including each redirect hop.
 *  - Fetch pages with a strict per-request timeout and robots.txt compliance.
 *  - Parse page metadata (title, meta description, h1 count, canonical).
 *  - Test every discovered link and separate hard errors from 30x redirects.
 *  - Run the full on-page + site-wide SEO check suite.
 */

const USER_AGENT = "Mozilla/5.0 (compatible; LinkWatchBot/1.0; +https://linkwatch.app/bot)";

const MAX_DEPTH = 2;
const MAX_PAGES = 100;
const MAX_LINKS = 80;
const CONCURRENCY = 3;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

export interface CrawlPageResult {
  url: string;
  httpStatus: number | null;
  responseTimeMs: number;
  isAllowedByRobots: boolean;
  rawHtml: string | null;
  errorMessage: string | null;
  title: string | null;
  metaDescription: string | null;
  h1Count: number | null;
  canonicalUrl: string | null;
  redirectedTo: string | null;
  redirectCount: number;
}

/* ---------------- SSRF guardrails ---------------- */

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map(Number);
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a = 0, b = 0] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

/** Reject localhost, private/reserved IPs, and non-HTTP(S) targets. Throws on blocked URLs. */
export function assertUrlAllowed(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Blocked: malformed URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Blocked: scheme "${url.protocol}" is not allowed`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("Blocked: localhost targets are not allowed");
  }
  if (isPrivateIpv4(host)) {
    throw new Error("Blocked: private IP addresses are not allowed");
  }
  if (host === "::1" || host === "::") {
    throw new Error("Blocked: loopback targets are not allowed");
  }
  if (/^(fe80|fc|fd)/i.test(host.replace(/:/g, ""))) {
    throw new Error("Blocked: private IPv6 ranges are not allowed");
  }
  return url;
}

/* ---------------- Robots.txt compliance ---------------- */

/**
 * Fetch a domain's /robots.txt and evaluate a path against its `User-agent: *`
 * rules using longest-match Allow/Disallow semantics.
 */
export async function checkRobotsPermission(domain: string, path: string): Promise<boolean> {
  let text: string;
  try {
    const res = await timedFetch(`https://${normalizeDomain(domain)}/robots.txt`, {
      method: "GET",
    });
    if (!res.response.ok) return true; // no robots.txt → allowed
    text = await res.response.text();
  } catch {
    return true; // unreachable robots.txt → allowed
  }

  // Parse groups; only `User-agent: *` groups apply to us.
  const groups: { applies: boolean; rules: { type: "allow" | "disallow"; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^(user-agent|allow|disallow)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const field = m[1]!.toLowerCase();
    const value = (m[2] ?? "").trim();
    if (field === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { applies: false, rules: [] };
        groups.push(current);
      }
      if (value === "*") current.applies = true;
    } else if (current && current.applies) {
      current.rules.push({ type: field as "allow" | "disallow", path: value });
    }
  }

  let best: { type: "allow" | "disallow"; length: number } | null = null;
  for (const group of groups) {
    if (!group.applies) continue;
    for (const rule of group.rules) {
      if (rule.path === "") continue;
      if (path.startsWith(rule.path) && rule.path.length >= (best?.length ?? -1)) {
        best = { type: rule.type, length: rule.path.length };
      }
    }
  }
  return best ? best.type === "allow" : true;
}

/* ---------------- Concurrency limiter ---------------- */

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface FoundLink {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
}

export interface BrokenResult extends FoundLink {
  httpStatus: number | null;
  errorType: string;
  /** True when the URL answered with a 30x hop rather than a hard failure. */
  isRedirect: boolean;
  redirectTarget: string | null;
}

export type SeoIssueType =
  | "title_missing"
  | "title_length"
  | "title_duplicate"
  | "meta_description_missing"
  | "meta_description_length"
  | "meta_description_duplicate"
  | "h1_missing"
  | "h1_multiple"
  | "img_alt_missing"
  | "insecure_internal_link"
  | "canonical_missing"
  | "canonical_invalid";

export interface SeoIssue {
  type: SeoIssueType;
  url: string;
  severity: "error" | "warning";
  message: string;
  detail: string | null;
}

export interface CrawlResult {
  pagesScanned: number;
  linksChecked: number;
  broken: BrokenResult[];
  redirects: BrokenResult[];
  seoIssues: SeoIssue[];
  pages: CrawlPageResult[];
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

export function classify(status: number | null): string {
  if (status === null) return "unreachable";
  if (status === 404) return "not_found";
  if (status === 410) return "gone";
  if (status === 403) return "forbidden";
  if (status === 401) return "unauthorized";
  if (status === 408) return "timeout";
  if (status >= 500) return "server_error";
  if (status >= 300 && status < 400) return "redirect";
  return "client_error";
}

interface FetchOutcome {
  response: Response;
  finalUrl: string;
  redirectCount: number;
  /** First 30x hop encountered, if any. */
  firstRedirectTo: string | null;
  firstRedirectStatus: number | null;
}

/**
 * Fetch with a hard 8s timeout, following at most 3 redirects manually so that
 * every hop is re-validated against the SSRF allowlist.
 */
async function timedFetch(url: string, init: RequestInit = {}): Promise<FetchOutcome> {
  let currentUrl = assertUrlAllowed(url).toString();
  let redirectCount = 0;
  let firstRedirectTo: string | null = null;
  let firstRedirectStatus: number | null = null;
  const deadline = Date.now() + TIMEOUT_MS;

  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Request timed out after 8s");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) },
      });
    } finally {
      clearTimeout(timer);
    }

    const location = response.headers.get("location");
    const isRedirect = response.status >= 300 && response.status < 400 && !!location;
    if (!isRedirect) {
      return { response, finalUrl: currentUrl, redirectCount, firstRedirectTo, firstRedirectStatus };
    }

    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      return { response, finalUrl: currentUrl, redirectCount, firstRedirectTo, firstRedirectStatus };
    }
    if (firstRedirectTo === null) {
      firstRedirectTo = nextUrl;
      firstRedirectStatus = response.status;
    }
    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error(`Blocked: more than ${MAX_REDIRECTS} redirects`);
    }
    // Re-validate every hop: a public URL may redirect into a private range.
    assertUrlAllowed(nextUrl);
    currentUrl = nextUrl;
    redirectCount += 1;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export interface PageMeta {
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  canonicalUrl: string | null;
}

/** Parse the SEO-relevant head/body metadata out of a page's HTML. */
export function extractPageMeta(html: string): PageMeta {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(stripTags(titleMatch[1] ?? "")) : "";

  const descMatch =
    /<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i.exec(
      html,
    ) ??
    /<meta[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["'][^>]*>/i.exec(html);
  const metaDescription = descMatch ? decodeEntities((descMatch[1] ?? "").trim()) : "";

  const h1Count = (html.match(/<h1\b[^>]*>/gi) ?? []).length;

  const canonicalMatch =
    /<link[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']*)["'][^>]*>/i.exec(html) ??
    /<link[^>]*href\s*=\s*["']([^"']*)["'][^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(html);
  const canonicalUrl = canonicalMatch ? (canonicalMatch[1] ?? "").trim() : "";

  return {
    title: title || null,
    metaDescription: metaDescription || null,
    h1Count,
    canonicalUrl: canonicalUrl || null,
  };
}

/** Inspect a single page's HTML for on-page SEO flaws. */
export function extractSeoIssues(html: string, pageUrl: string, origin: string): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const push = (
    type: SeoIssueType,
    severity: SeoIssue["severity"],
    message: string,
    detail: string | null = null,
  ) => issues.push({ type, url: pageUrl, severity, message, detail });

  const meta = extractPageMeta(html);

  // 1. Title
  if (!meta.title) {
    push("title_missing", "error", "Page is missing a <title> tag");
  } else if (meta.title.length < 30 || meta.title.length > 60) {
    push(
      "title_length",
      "warning",
      `Title length is ${meta.title.length} characters (recommended 30-60)`,
      meta.title,
    );
  }

  // 2. Meta description
  if (!meta.metaDescription) {
    push("meta_description_missing", "error", "Page is missing a meta description");
  } else if (meta.metaDescription.length < 70 || meta.metaDescription.length > 160) {
    push(
      "meta_description_length",
      "warning",
      `Meta description length is ${meta.metaDescription.length} characters (recommended 70-160)`,
      meta.metaDescription,
    );
  }

  // 3. H1
  if (meta.h1Count === 0) {
    push("h1_missing", "error", "Page is missing an <h1> heading");
  } else if (meta.h1Count > 1) {
    push(
      "h1_multiple",
      "warning",
      `Page has ${meta.h1Count} <h1> headings (recommended exactly 1)`,
    );
  }

  // 4. Canonical tag
  if (!meta.canonicalUrl) {
    push("canonical_missing", "warning", "Page is missing a canonical link tag");
  } else {
    let canonicalOk = false;
    try {
      const canonical = new URL(meta.canonicalUrl, pageUrl);
      canonicalOk = canonical.protocol === "https:" || canonical.protocol === "http:";
      if (canonicalOk && canonical.hostname !== origin) canonicalOk = false;
    } catch {
      canonicalOk = false;
    }
    if (!canonicalOk) {
      push(
        "canonical_invalid",
        "warning",
        "Canonical tag is not a valid absolute URL on this domain",
        meta.canonicalUrl,
      );
    }
  }

  // 5. Images missing alt
  const imgRe = /<img\b[^>]*>/gi;
  let imgMatch: RegExpExecArray | null;
  let missingAlt = 0;
  const missingAltSrcs: string[] = [];
  while ((imgMatch = imgRe.exec(html)) !== null) {
    const tag = imgMatch[0];
    const altMatch = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!altMatch || (altMatch[1] ?? "").trim() === "") {
      missingAlt += 1;
      const srcMatch = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag);
      const src = srcMatch?.[1];
      if (src && missingAltSrcs.length < 5) missingAltSrcs.push(src);
    }
  }
  if (missingAlt > 0) {
    push(
      "img_alt_missing",
      "warning",
      `${missingAlt} image(s) missing alt text`,
      missingAltSrcs.join(", ") || null,
    );
  }

  // 6. Insecure internal links
  const insecure = new Set<string>();
  const hrefRe = /href\s*=\s*["'](http:\/\/[^"']+)["']/gi;
  let hrefMatch: RegExpExecArray | null;
  while ((hrefMatch = hrefRe.exec(html)) !== null) {
    const rawUrl = hrefMatch[1];
    if (!rawUrl) continue;
    try {
      if (new URL(rawUrl).hostname === origin) insecure.add(rawUrl);
    } catch {
      // ignore malformed URLs
    }
  }
  for (const url of [...insecure].slice(0, 10)) {
    push("insecure_internal_link", "warning", "Internal link uses http:// instead of https://", url);
  }

  return issues;
}

/** Site-wide duplicate title / description detection across all crawled pages. */
export function findDuplicateIssues(pages: CrawlPageResult[]): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const byTitle = new Map<string, string[]>();
  const byDescription = new Map<string, string[]>();

  for (const page of pages) {
    if (page.title) {
      const key = page.title.trim().toLowerCase();
      byTitle.set(key, [...(byTitle.get(key) ?? []), page.url]);
    }
    if (page.metaDescription) {
      const key = page.metaDescription.trim().toLowerCase();
      byDescription.set(key, [...(byDescription.get(key) ?? []), page.url]);
    }
  }

  for (const [, urls] of byTitle) {
    if (urls.length < 2) continue;
    for (const url of urls) {
      issues.push({
        type: "title_duplicate",
        url,
        severity: "warning",
        message: `Title is duplicated across ${urls.length} pages`,
        detail: urls.filter((u) => u !== url).slice(0, 5).join(", "),
      });
    }
  }
  for (const [, urls] of byDescription) {
    if (urls.length < 2) continue;
    for (const url of urls) {
      issues.push({
        type: "meta_description_duplicate",
        url,
        severity: "warning",
        message: `Meta description is duplicated across ${urls.length} pages`,
        detail: urls.filter((u) => u !== url).slice(0, 5).join(", "),
      });
    }
  }
  return issues;
}

function extractLinks(html: string, pageUrl: string): FoundLink[] {
  const links: FoundLink[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = (match[1] ?? "").trim();
    if (!raw || /^(mailto:|tel:|javascript:|data:|#)/i.test(raw)) continue;
    let resolved: URL;
    try {
      resolved = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    resolved.hash = "";
    links.push({
      sourceUrl: pageUrl,
      targetUrl: resolved.toString(),
      anchorText: stripTags(match[2] ?? "") || "(no anchor text)",
    });
  }
  return links;
}

/**
 * Test a single link. Returns null when healthy, a `isRedirect: true` result for
 * 30x hops, and an error result for 404 / 410 / 4xx / 5xx / timeouts.
 */
async function checkLink(link: FoundLink): Promise<BrokenResult | null> {
  try {
    let outcome = await timedFetch(link.targetUrl, { method: "HEAD" });
    let status = outcome.response.status;
    if (status === 405 || status === 501 || status === 403) {
      outcome = await timedFetch(link.targetUrl, { method: "GET" });
      status = outcome.response.status;
    }

    if (status >= 400) {
      return {
        ...link,
        httpStatus: status,
        errorType: classify(status),
        isRedirect: false,
        redirectTarget: null,
      };
    }
    // Healthy destination, but it was reached through a 30x hop.
    if (outcome.redirectCount > 0) {
      return {
        ...link,
        httpStatus: outcome.firstRedirectStatus ?? 301,
        errorType: "redirect",
        isRedirect: true,
        redirectTarget: outcome.finalUrl,
      };
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ...link,
      httpStatus: null,
      errorType: /timed out/i.test(message) ? "timeout" : "unreachable",
      isRedirect: false,
      redirectTarget: null,
    };
  }
}

/** Crawl a domain's pages and return every broken link, redirect and SEO issue found. */
export async function crawlSite(domain: string): Promise<CrawlResult> {
  const clean = normalizeDomain(domain);
  const startUrl = `https://${clean}`;
  const origin = new URL(startUrl).hostname;

  // SSRF guardrail: refuse to crawl private/loopback targets entirely.
  try {
    assertUrlAllowed(startUrl);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `Blocked: ${clean} is not a crawlable public domain.`,
    );
  }

  // Fetch robots.txt once per scan and evaluate paths against its rules.
  const robotsCache = new Map<string, Promise<boolean>>();
  const isAllowedByRobots = (path: string): Promise<boolean> => {
    if (!robotsCache.has(path)) {
      robotsCache.set(path, checkRobotsPermission(clean, path));
    }
    return robotsCache.get(path)!;
  };

  // Depth-aware queue: homepage is depth 0; links found on it are depth 1, etc.
  const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];
  const queued = new Set<string>([startUrl]);
  const visited = new Set<string>();
  const found = new Map<string, FoundLink>();
  const seoIssues: SeoIssue[] = [];
  const pages: CrawlPageResult[] = [];

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const { url: pageUrl, depth } = queue.shift()!;
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    const allowed = await isAllowedByRobots(new URL(pageUrl).pathname);
    const startedAt = Date.now();

    if (!allowed) {
      pages.push({
        url: pageUrl,
        httpStatus: null,
        responseTimeMs: Date.now() - startedAt,
        isAllowedByRobots: false,
        rawHtml: null,
        errorMessage: "restricted_by_robots",
        title: null,
        metaDescription: null,
        h1Count: null,
        canonicalUrl: null,
        redirectedTo: null,
        redirectCount: 0,
      });
      continue;
    }

    let html: string | null = null;
    let record: CrawlPageResult;
    try {
      const outcome = await timedFetch(pageUrl, { method: "GET" });
      record = {
        url: pageUrl,
        httpStatus: outcome.response.status,
        responseTimeMs: Date.now() - startedAt,
        isAllowedByRobots: true,
        rawHtml: null,
        errorMessage: null,
        title: null,
        metaDescription: null,
        h1Count: null,
        canonicalUrl: null,
        redirectedTo: outcome.redirectCount > 0 ? outcome.finalUrl : null,
        redirectCount: outcome.redirectCount,
      };
      pages.push(record);
      if (!outcome.response.ok) continue;
      const type = outcome.response.headers.get("content-type") ?? "";
      if (!type.includes("html")) continue;
      html = (await outcome.response.text()).slice(0, 400_000);
      record.rawHtml = html;
      const meta = extractPageMeta(html);
      record.title = meta.title;
      record.metaDescription = meta.metaDescription;
      record.h1Count = meta.h1Count;
      record.canonicalUrl = meta.canonicalUrl;
    } catch (error) {
      if (pageUrl === startUrl) {
        throw new Error(`Could not reach ${clean}. Check the domain and try again.`);
      }
      const message = error instanceof Error ? error.message : "fetch_failed";
      pages.push({
        url: pageUrl,
        httpStatus: null,
        responseTimeMs: Date.now() - startedAt,
        isAllowedByRobots: true,
        rawHtml: null,
        errorMessage: /timed out/i.test(message) ? "timeout" : message,
        title: null,
        metaDescription: null,
        h1Count: null,
        canonicalUrl: null,
        redirectedTo: null,
        redirectCount: 0,
      });
      continue;
    }

    seoIssues.push(...extractSeoIssues(html, pageUrl, origin));

    for (const link of extractLinks(html, pageUrl)) {
      if (!found.has(link.targetUrl) && found.size < MAX_LINKS) {
        found.set(link.targetUrl, link);
      }
      // Only recurse within MAX_DEPTH, on the same origin, under MAX_PAGES.
      if (depth >= MAX_DEPTH) continue;
      const host = new URL(link.targetUrl).hostname;
      if (
        host === origin &&
        !visited.has(link.targetUrl) &&
        !queued.has(link.targetUrl) &&
        visited.size + queue.length < MAX_PAGES
      ) {
        queued.add(link.targetUrl);
        queue.push({ url: link.targetUrl, depth: depth + 1 });
      }
    }
  }

  // Site-wide duplicate checks once every page's metadata is known.
  seoIssues.push(...findDuplicateIssues(pages));

  // Check every discovered link with a hard cap of 3 concurrent requests.
  const links = [...found.values()];
  const checked = await mapWithConcurrency(links, CONCURRENCY, checkLink);
  const results = checked.filter((r): r is BrokenResult => r !== null);
  const broken = results.filter((r) => !r.isRedirect);
  const redirects = results.filter((r) => r.isRedirect);

  return {
    pagesScanned: visited.size,
    linksChecked: links.length,
    broken,
    redirects,
    seoIssues,
    pages,
  };
}

/** Re-test a single URL. Returns null when it is healthy again. */
export async function recheckUrl(
  targetUrl: string,
): Promise<{ httpStatus: number | null; errorType: string } | null> {
  const result = await checkLink({ sourceUrl: "", targetUrl, anchorText: "" });
  if (!result) return null;
  // A working destination behind a redirect counts as healthy for verification.
  if (result.isRedirect) return null;
  return { httpStatus: result.httpStatus, errorType: result.errorType };
}
