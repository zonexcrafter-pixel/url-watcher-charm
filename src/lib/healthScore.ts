import type { BrokenLinkRow, SeoIssueRow } from "@/lib/monitor.functions";

export type Severity = "critical" | "high" | "medium" | "low" | "fixed";

export type Category = "Broken Links" | "Internal Linking" | "On-Page SEO" | "Technical SEO";

/**
 * LinkWatch Health Score — transparent weighted deduction model.
 * Base score is 100; each open issue deducts points by severity.
 * The score is clamped at 0. Fixed issues deduct nothing.
 */
export const HEALTH_SCORE_WEIGHTS: Record<Exclude<Severity, "fixed">, number> = {
  critical: 15,
  high: 8,
  medium: 3,
  low: 1,
} as const;

/** @deprecated Use HEALTH_SCORE_WEIGHTS. */
export const SEVERITY_POINTS = HEALTH_SCORE_WEIGHTS;

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "fixed"];

export const SEVERITY_BADGE: Record<Severity, string> = {
  critical: "bg-red-500/10 text-red-600 border-red-500/40 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/40 dark:text-orange-400",
  medium: "bg-yellow-500/10 text-yellow-700 border-yellow-500/40 dark:text-yellow-400",
  low: "bg-slate-500/10 text-slate-600 border-slate-500/40 dark:text-slate-300",
  fixed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/40 dark:text-emerald-400",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  fixed: "Fixed",
};

export function linkSeverity(link: BrokenLinkRow): Severity {
  if (link.fixed_at !== null) return "fixed";
  if (link.http_status === 404) return "critical";
  if (link.error_type === "server_error" || link.error_type === "unreachable") return "high";
  if (link.error_type === "gone" || link.error_type === "not_found") return "high";
  if (link.error_type === "forbidden" || link.error_type === "unauthorized") return "medium";
  return "low";
}

export function seoIssueSeverity(issue: SeoIssueRow): Severity {
  switch (issue.type) {
    case "title_missing":
    case "h1_missing":
      return "high";
    case "meta_description_missing":
      return "medium";
    case "h1_multiple":
      return "medium";
    case "title_length":
    case "meta_description_length":
      return "low";
    case "img_alt_missing":
      return "medium";
    case "insecure_internal_link":
      return "low";
    default:
      return issue.severity === "error" ? "high" : "medium";
  }
}

export function linkCategory(_link: BrokenLinkRow): Category {
  return "Broken Links";
}

export function seoIssueCategory(issue: SeoIssueRow): Category {
  switch (issue.type) {
    case "insecure_internal_link":
      return "Internal Linking";
    case "title_missing":
    case "title_length":
    case "meta_description_missing":
    case "meta_description_length":
      return "On-Page SEO";
    default:
      return "Technical SEO";
  }
}

export interface ScoreIssue {
  severity: Severity;
  category?: Category;
}

export interface CategoryScore {
  category: Category;
  score: number;
  deductions: number;
  openIssues: number;
}

export interface HealthScoreResult {
  /** Overall LinkWatch Health Score, 0–100. */
  score: number;
  categories: CategoryScore[];
  counts: Record<Severity, number>;
}

/**
 * LinkWatch Health Score: start at 100 and subtract HEALTH_SCORE_WEIGHTS
 * per open issue (critical −15, high −8, medium −3, low −1), clamped at 0.
 */
export function calculateHealthScore(issues: ScoreIssue[]): HealthScoreResult {
  const byCategory = new Map<Category, { deductions: number; openIssues: number }>();
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, fixed: 0 };
  let totalDeductions = 0;

  for (const issue of issues) {
    counts[issue.severity] += 1;
    const points = issue.severity === "fixed" ? 0 : HEALTH_SCORE_WEIGHTS[issue.severity];
    totalDeductions += points;
    if (issue.category) {
      const entry = byCategory.get(issue.category) ?? { deductions: 0, openIssues: 0 };
      entry.deductions += points;
      if (issue.severity !== "fixed") entry.openIssues += 1;
      byCategory.set(issue.category, entry);
    }
  }

  const categories: CategoryScore[] = (
    ["Broken Links", "Internal Linking", "On-Page SEO", "Technical SEO"] as Category[]
  ).map((category) => {
    const entry = byCategory.get(category) ?? { deductions: 0, openIssues: 0 };
    return {
      category,
      score: Math.max(0, 100 - entry.deductions),
      deductions: entry.deductions,
      openIssues: entry.openIssues,
    };
  });

  return { score: Math.max(0, 100 - totalDeductions), categories, counts };
}

/** Convenience: build the issue list for calculateHealthScore from live rows. */
export function toScoreIssues(links: BrokenLinkRow[], seoIssues: SeoIssueRow[]): ScoreIssue[] {
  return [
    ...links.map((link) => ({ severity: linkSeverity(link), category: linkCategory(link) })),
    ...seoIssues.map((issue) => ({
      severity: seoIssueSeverity(issue),
      category: seoIssueCategory(issue),
    })),
  ];
}
