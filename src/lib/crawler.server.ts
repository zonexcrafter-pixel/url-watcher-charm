/**
 * Server-only web crawler used by the scan server function.
 * Fetches the target page, discovers internal links, then tests every
 * discovered link's HTTP status to find broken ones.
 */

const USER_AGENT = "Mozilla/5.0 (compatible; LinkWatchBot/1.0; +https://linkwatch.app/bot)";

const MAX_DEPTH = 2;
const MAX_PAGES = 100;
const MAX_LINKS = 80;
const CONCURRENCY = 3;
const TIMEOUT_MS = 8000;

export interface CrawlPageResult {
  url: string;
  httpStatus: number | null;
  responseTimeMs: number;
  isAllowedByRobots: boolean;
  rawHtml: string | null;
  errorMessage: string | null;
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
    const res = await timedFetch(`https://${normalizeDomain(domain)}/robots.txt`, { method: "GET" });
    if (!res.ok) return true; // no robots.txt → allowed
    text = await res.text();
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
}

export type SeoIssueType =
  | "title_missing"
  | "title_length"
  | "meta_description_missing"
  | "meta_description_length"
  | "h1_missing"
  | "h1_multiple"
  | "img_alt_missing"
  | "insecure_internal_link";

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
  if (status >= 500) return "server_error";
  return "client_error";
}

async function timedFetch(url: string, init: RequestInit = {}) {
  // SSRF guardrail: every outbound request is validated before dispatch.
  assertUrlAllowed(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
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

/** Inspect a page's HTML for on-page SEO flaws. */
export function extractSeoIssues(html: string, pageUrl: string, origin: string): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const push = (
    type: SeoIssueType,
    severity: SeoIssue["severity"],
    message: string,
    detail: string | null = null,
  ) => issues.push({ type, url: pageUrl, severity, message, detail });

  // 1. Title
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(stripTags(titleMatch[1] ?? "")) : "";
  if (!title) {
    push("title_missing", "error", "Page is missing a <title> tag");
  } else if (title.length < 30 || title.length > 60) {
    push(
      "title_length",
      "warning",
      `Title length is ${title.length} characters (recommended 30-60)`,
      title,
    );
  }

  // 2. Meta description
  const descMatch =
    /<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i.exec(
      html,
    ) ??
    /<meta[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["'][^>]*>/i.exec(html);
  const description = descMatch ? decodeEntities((descMatch[1] ?? "").trim()) : "";
  if (!description) {
    push("meta_description_missing", "error", "Page is missing a meta description");
  } else if (description.length < 70 || description.length > 160) {
    push(
      "meta_description_length",
      "warning",
      `Meta description length is ${description.length} characters (recommended 70-160)`,
      description,
    );
  }

  // 3. H1
  const h1Count = (html.match(/<h1\b[^>]*>/gi) ?? []).length;
  if (h1Count === 0) {
    push("h1_missing", "error", "Page is missing an <h1> heading");
  } else if (h1Count > 1) {
    push("h1_multiple", "warning", `Page has ${h1Count} <h1> headings (recommended exactly 1)`);
  }

  // 4. Images missing alt
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

  // 5. Insecure internal links
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
    push(
      "insecure_internal_link",
      "warning",
      "Internal link uses http:// instead of https://",
      url,
    );
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

async function checkLink(link: FoundLink): Promise<BrokenResult | null> {
  try {
    let res = await timedFetch(link.targetUrl, { method: "HEAD" });
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      res = await timedFetch(link.targetUrl, { method: "GET" });
    }
    if (res.status >= 400) {
      return { ...link, httpStatus: res.status, errorType: classify(res.status) };
    }
    return null;
  } catch {
    return { ...link, httpStatus: null, errorType: "unreachable" };
  }
}

/** Crawl a domain's pages and return every broken link and SEO issue found. */
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
    let html: string | null = null;

    if (!allowed) {
      pages.push({
        url: pageUrl,
        httpStatus: null,
        responseTimeMs: Date.now() - startedAt,
        isAllowedByRobots: false,
        rawHtml: null,
        errorMessage: "restricted_by_robots",
      });
      continue;
    }

    try {
      const res = await timedFetch(pageUrl, { method: "GET" });
      pages.push({
        url: pageUrl,
        httpStatus: res.status,
        responseTimeMs: Date.now() - startedAt,
        isAllowedByRobots: true,
        rawHtml: null,
        errorMessage: null,
      });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("html")) continue;
      html = (await res.text()).slice(0, 400_000);
      pages[pages.length - 1]!.rawHtml = html;
    } catch (error) {
      if (pageUrl === startUrl) {
        throw new Error(`Could not reach ${clean}. Check the domain and try again.`);
      }
      pages.push({
        url: pageUrl,
        httpStatus: null,
        responseTimeMs: Date.now() - startedAt,
        isAllowedByRobots: true,
        rawHtml: null,
        errorMessage: error instanceof Error ? error.message : "fetch_failed",
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

  // Check every discovered link with a hard cap of 3 concurrent requests.
  const links = [...found.values()];
  const checked = await mapWithConcurrency(links, CONCURRENCY, checkLink);
  const broken = checked.filter((r): r is BrokenResult => r !== null);

  return {
    pagesScanned: visited.size,
    linksChecked: links.length,
    broken,
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
  return { httpStatus: result.httpStatus, errorType: result.errorType };
}
