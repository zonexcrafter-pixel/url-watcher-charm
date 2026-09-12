/**
 * Server-only web crawler used by the scan server function.
 * Fetches the target page, discovers internal links, then tests every
 * discovered link's HTTP status to find broken ones.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; LinkWatchBot/1.0; +https://linkwatch.app/bot)";

const MAX_PAGES = 6;
const MAX_LINKS = 80;
const CONCURRENCY = 8;
const TIMEOUT_MS = 8000;

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

/** Crawl a domain's pages and return every broken link found. */
export async function crawlSite(domain: string): Promise<CrawlResult> {
  const clean = normalizeDomain(domain);
  const startUrl = `https://${clean}`;
  const origin = new URL(startUrl).hostname;

  const queue: string[] = [startUrl];
  const visited = new Set<string>();
  const found = new Map<string, FoundLink>();

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const pageUrl = queue.shift()!;
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    let html = "";
    try {
      const res = await timedFetch(pageUrl, { method: "GET" });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("html")) continue;
      html = (await res.text()).slice(0, 400_000);
    } catch {
      if (pageUrl === startUrl) {
        throw new Error(`Could not reach ${clean}. Check the domain and try again.`);
      }
      continue;
    }

    for (const link of extractLinks(html, pageUrl)) {
      if (!found.has(link.targetUrl) && found.size < MAX_LINKS) {
        found.set(link.targetUrl, link);
      }
      const host = new URL(link.targetUrl).hostname;
      if (
        host === origin &&
        !visited.has(link.targetUrl) &&
        visited.size + queue.length < MAX_PAGES
      ) {
        queue.push(link.targetUrl);
      }
    }
  }

  const links = [...found.values()];
  const broken: BrokenResult[] = [];
  for (let i = 0; i < links.length; i += CONCURRENCY) {
    const batch = links.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(checkLink));
    for (const result of results) if (result) broken.push(result);
  }

  return { pagesScanned: visited.size, linksChecked: links.length, broken };
}

/** Re-test a single URL. Returns null when it is healthy again. */
export async function recheckUrl(
  targetUrl: string,
): Promise<{ httpStatus: number | null; errorType: string } | null> {
  const result = await checkLink({ sourceUrl: "", targetUrl, anchorText: "" });
  if (!result) return null;
  return { httpStatus: result.httpStatus, errorType: result.errorType };
}
