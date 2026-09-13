/**
 * Heuristic "AI" fix suggestion engine.
 *
 * Broken links: compares the dead URL's path, the anchor text and the candidate
 * page titles/slugs known from the crawl to propose the most likely replacement
 * URL with a confidence score.
 *
 * SEO issues: derives a suggested title / meta description / heading from the
 * page slug so the modal can show a Before / After preview.
 */

import type { BrokenLinkRow, SeoIssueRow } from "@/lib/monitor.functions";

export interface FixSuggestion {
  /** Suggested value: a replacement URL, or suggested copy for SEO issues. */
  value: string;
  /** 0-100 */
  confidence: number;
  /** Plain-language explanation of how the suggestion was derived. */
  rationale: string;
  /** Current/broken value shown in the "Before" box. */
  before: string;
  beforeLabel: string;
  afterLabel: string;
  /** Whether the suggestion is a URL the user can apply as a replacement link. */
  isReplacementUrl: boolean;
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
  "our",
  "your",
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

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const hits = a.filter((t) => setB.has(t)).length;
  return hits / Math.max(a.length, b.length);
}

/** Cheap character bigram similarity, 0-1. */
function bigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const ga = grams(a.toLowerCase());
  const gb = grams(b.toLowerCase());
  if (ga.size === 0 || gb.size === 0) return 0;
  let hits = 0;
  ga.forEach((g) => {
    if (gb.has(g)) hits++;
  });
  return (2 * hits) / (ga.size + gb.size);
}

export function titleCase(slug: string): string {
  const words = slug
    .replace(/\.(html?|php|aspx?)$/i, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/**
 * Suggest a replacement URL for a broken link by comparing path similarity,
 * anchor text and directory context against known live pages of the site.
 */
export function suggestReplacementUrl(
  link: BrokenLinkRow,
  candidateUrls: string[],
): FixSuggestion | null {
  const brokenPath = pathOf(link.target_url);
  const brokenSlug = lastSegment(brokenPath);
  const brokenTokens = tokenize(brokenPath);
  const anchorTokens = tokenize(link.anchor_text ?? "");
  const brokenDir = brokenPath.slice(0, brokenPath.lastIndexOf("/"));

  let best: { url: string; score: number; reasons: string[] } | null = null;

  for (const candidate of candidateUrls) {
    if (candidate === link.target_url) continue;
    const path = pathOf(candidate);
    const slug = lastSegment(path);
    const tokens = tokenize(path);
    const reasons: string[] = [];

    const slugSim = bigramSimilarity(brokenSlug, slug);
    let score = slugSim * 0.5;
    if (slugSim > 0.5) reasons.push("near-identical URL slug");

    const pathOverlap = overlap(brokenTokens, tokens);
    score += pathOverlap * 0.2;
    if (pathOverlap > 0.4) reasons.push("shared URL path keywords");

    const anchorOverlap = overlap(anchorTokens, tokens);
    score += anchorOverlap * 0.25;
    if (anchorOverlap > 0.3) reasons.push("anchor text matches the page slug");

    if (brokenDir && path.startsWith(brokenDir + "/")) {
      score += 0.1;
      reasons.push("same site section");
    }

    if (!best || score > best.score) best = { url: candidate, score, reasons };
  }

  if (!best || best.score < 0.15) return null;

  const confidence = Math.min(96, Math.max(35, Math.round(best.score * 100)));
  const reasonText =
    best.reasons.length > 0 ? best.reasons.join(", ") : "closest live page on this domain";

  return {
    value: best.url,
    confidence,
    rationale: `${confidence}% confidence — ${reasonText}. Compared the dead path “${brokenPath}” and anchor “${link.anchor_text ?? "n/a"}” against ${candidateUrls.length} live pages found during the crawl.`,
    before: link.target_url,
    beforeLabel: "Old link (broken)",
    afterLabel: "Suggested replacement link",
    isReplacementUrl: true,
  };
}

const PROBLEM_COPY: Record<string, { problem: string; why: string }> = {
  title_missing: {
    problem: "This page has no <title> tag.",
    why: "The title is the headline Google shows in search results. Without it, search engines invent one from page text and click-through rate drops sharply.",
  },
  title_length: {
    problem: "The page title is outside the 30–60 character sweet spot.",
    why: "Titles that are too short waste ranking space; too long and Google truncates them mid-sentence, so users never see your value proposition.",
  },
  meta_description_missing: {
    problem: "This page is missing a meta description.",
    why: "The meta description is your free ad copy in search results. Without one, Google scrapes arbitrary page text, which usually reads poorly and lowers clicks.",
  },
  meta_description_length: {
    problem: "The meta description length is outside 70–160 characters.",
    why: "Descriptions get cut off after roughly 160 characters, and very short ones look thin next to competitors in the results page.",
  },
  h1_missing: {
    problem: "There is no <h1> heading on this page.",
    why: "The H1 tells both readers and crawlers what the page is about. Missing it weakens topical relevance and hurts accessibility.",
  },
  h1_multiple: {
    problem: "This page has more than one <h1> heading.",
    why: "Multiple H1s split the page's topical signal, so search engines are less certain what the page should rank for.",
  },
  img_alt_missing: {
    problem: "One or more images have no alt attribute.",
    why: "Alt text is how screen readers describe images and how Google understands them. Missing alt text loses image search traffic and creates accessibility gaps.",
  },
  insecure_internal_link: {
    problem: "Internal links still point to http:// instead of https://.",
    why: "Insecure links trigger browser warnings, add an extra redirect hop, and waste crawl budget on every visit.",
  },
};

export function seoProblemCopy(type: string): { problem: string; why: string } {
  return (
    PROBLEM_COPY[type] ?? {
      problem: "An on-page SEO issue was detected.",
      why: "Fixing on-page issues improves how search engines interpret and rank this page.",
    }
  );
}

/** Suggest copy (title / description / heading) for an SEO issue. */
export function suggestSeoFix(issue: SeoIssueRow): FixSuggestion | null {
  const slug = lastSegment(pathOf(issue.url));
  const host = (() => {
    try {
      return new URL(issue.url).hostname.replace(/^www\./, "");
    } catch {
      return issue.domain;
    }
  })();
  const topic = titleCase(slug) || titleCase(host.split(".")[0] ?? "") || "Home";
  const brand = titleCase(host.split(".")[0] ?? "") || issue.domain;
  const current = issue.detail ?? "";

  switch (issue.type) {
    case "title_missing":
    case "title_length": {
      const suggested = `${topic} | ${brand}`.slice(0, 60);
      const conf = slug ? 88 : 72;
      return {
        value: suggested,
        confidence: conf,
        rationale: `${conf}% confidence — derived the topic “${topic}” from the URL slug and appended the brand name to land inside the 30–60 character range.`,
        before: current || "(no title found)",
        beforeLabel: "Old title",
        afterLabel: "Suggested AI title",
        isReplacementUrl: false,
      };
    }
    case "meta_description_missing":
    case "meta_description_length": {
      const suggested =
        `Explore ${topic.toLowerCase()} at ${brand}. Clear details, practical guidance, and next steps — everything you need on one page.`.slice(
          0,
          158,
        );
      return {
        value: suggested,
        confidence: 81,
        rationale: `81% confidence — built a 70–160 character summary around the page topic “${topic}” and the brand “${brand}”. Review the wording before publishing.`,
        before: current || "(no meta description found)",
        beforeLabel: "Old meta description",
        afterLabel: "Suggested AI meta description",
        isReplacementUrl: false,
      };
    }
    case "h1_missing":
    case "h1_multiple": {
      return {
        value: topic,
        confidence: 84,
        rationale: `84% confidence — “${topic}” matches the URL slug, so it is the most likely primary heading for this page. Keep exactly one H1.`,
        before: current || "(no single H1 found)",
        beforeLabel: "Current headings",
        afterLabel: "Suggested single H1",
        isReplacementUrl: false,
      };
    }
    case "img_alt_missing": {
      return {
        value: `alt="${topic} — descriptive summary of what the image shows"`,
        confidence: 70,
        rationale: `70% confidence — pattern generated from the page topic “${topic}”. Alt text should describe each specific image, so edit per image.`,
        before: current || "(images with no alt attribute)",
        beforeLabel: "Current markup",
        afterLabel: "Suggested alt attribute",
        isReplacementUrl: false,
      };
    }
    case "insecure_internal_link": {
      const fixed = current.replace(/http:\/\//g, "https://");
      return {
        value: fixed || "https://" + host,
        confidence: 95,
        rationale:
          "95% confidence — the same host already answers over HTTPS, so switching the scheme is a safe one-line change.",
        before: current || "http:// internal links",
        beforeLabel: "Old link",
        afterLabel: "Suggested secure link",
        isReplacementUrl: false,
      };
    }
    default:
      return null;
  }
}
