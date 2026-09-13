/**
 * Heuristic replacement engine.
 *
 * Finds the most likely live replacement for a broken URL by comparing the
 * dead path against pages discovered during the crawl, using Levenshtein
 * distance on the URL slugs plus word overlap with the anchor text.
 * Pure string heuristics — no AI involved.
 */

export interface ScannedPageRef {
  url: string;
  title: string;
}

export interface ReplacementCandidate {
  url: string;
  title: string;
  /** Match score, 0-100. */
  score: number;
  method: "heuristic_string_matching";
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "with",
  "page",
  "html",
  "php",
  "index",
  "www",
  "com",
]);

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function lastSegment(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Classic Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Normalized string similarity 0-1 based on edit distance. */
function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Jaccard-style word overlap 0-1. */
function wordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const hits = a.filter((t) => setB.has(t)).length;
  return hits / Math.max(a.length, b.length);
}

/**
 * Rank scanned pages as replacement candidates for a broken URL.
 * Returns the top 3 matches sorted by score (0-100%), method-labeled as
 * heuristic string matching.
 */
export function findReplacementCandidates(
  brokenUrl: string,
  sourceAnchorText: string,
  scannedPages: ScannedPageRef[],
): ReplacementCandidate[] {
  const brokenPath = pathOf(brokenUrl);
  const brokenSlug = lastSegment(brokenPath).replace(/\.(html?|php|aspx?)$/i, "");
  const brokenTokens = tokenize(brokenPath);
  const anchorTokens = tokenize(sourceAnchorText);
  const brokenDir = brokenPath.slice(0, brokenPath.lastIndexOf("/"));

  const scored = scannedPages
    .filter((p) => p.url !== brokenUrl)
    .map((page) => {
      const path = pathOf(page.url);
      const slug = lastSegment(path).replace(/\.(html?|php|aspx?)$/i, "");
      const pathTokens = tokenize(path);
      const titleTokens = tokenize(page.title ?? "");

      // Slug similarity via Levenshtein — strongest signal.
      const slugSim = stringSimilarity(brokenSlug, slug);
      // Path keyword overlap.
      const pathSim = wordOverlap(brokenTokens, pathTokens);
      // Anchor text vs page path + title words.
      const anchorSim = Math.max(
        wordOverlap(anchorTokens, pathTokens),
        wordOverlap(anchorTokens, titleTokens),
      );
      // Same directory bonus.
      const dirBonus = brokenDir && path.startsWith(brokenDir + "/") ? 0.1 : 0;

      const raw = slugSim * 0.45 + pathSim * 0.2 + anchorSim * 0.25 + dirBonus;
      const score = Math.min(99, Math.round(raw * 100));

      return { url: page.url, title: page.title, score };
    })
    .filter((c) => c.score > 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((c) => ({ ...c, method: "heuristic_string_matching" as const }));

  return scored;
}
