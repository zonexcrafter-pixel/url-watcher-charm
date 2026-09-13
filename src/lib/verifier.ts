import { supabase } from "@/integrations/supabase/client";

/**
 * Issue lifecycle state machine.
 *
 * detected → suggested → approved → awaiting_fix → verifying → verified
 * Any state may transition to `ignored`. `fixed` is kept as a legacy alias
 * that can be promoted straight to `verified` for backwards compatibility.
 */
export type IssueLifecycleState =
  | "detected"
  | "suggested"
  | "approved"
  | "awaiting_fix"
  | "verifying"
  | "verified"
  | "ignored"
  | "fixed";

const VALID_TRANSITIONS: Record<IssueLifecycleState, IssueLifecycleState[]> = {
  detected: ["suggested", "ignored"],
  suggested: ["approved", "ignored"],
  approved: ["awaiting_fix", "ignored"],
  awaiting_fix: ["verifying", "ignored"],
  verifying: ["verified", "awaiting_fix"],
  verified: [],
  ignored: [],
  // Legacy rows written before the full lifecycle existed.
  fixed: ["verified", "ignored"],
};

/** Returns true when a transition from `from` to `to` is allowed. */
export function canTransition(
  from: IssueLifecycleState | string,
  to: IssueLifecycleState | string,
): boolean {
  const allowed = VALID_TRANSITIONS[from as IssueLifecycleState];
  return Array.isArray(allowed) && allowed.includes(to as IssueLifecycleState);
}

/** Throws when a transition is not permitted by the state machine. */
export function assertTransition(
  from: IssueLifecycleState | string,
  to: IssueLifecycleState | string,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid issue state transition: ${from} → ${to}`);
  }
}

export type VerifyFixResult =
  | { success: true; status: number; verifiedAt: string }
  | { success: false; reason: string };

function resolveHref(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

/** True when two URLs point at the same target (trailing-slash tolerant). */
function sameUrl(a: string, b: string): boolean {
  const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Verifies that a fix has actually shipped on the live site:
 *  1. Fetches `sourceUrl` and parses its HTML.
 *  2. Confirms the old broken target is gone and the new target is present.
 *  3. Fetches `newTargetUrl` and requires a 200 OK response.
 *  4. On success, transitions the issue to `verified` with `verified_at = NOW()`.
 *     On failure the issue stays in `awaiting_fix`.
 */
export async function verifyFixOnLiveSite(
  issueId: string,
  sourceUrl: string,
  oldTargetUrl: string,
  newTargetUrl: string,
): Promise<VerifyFixResult> {
  // 1. Fetch the page that contained the broken link.
  let html: string;
  try {
    const res = await fetch(sourceUrl, {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) {
      return { success: false, reason: `Source page returned HTTP ${res.status}` };
    }
    html = await res.text();
  } catch {
    return {
      success: false,
      reason: "Could not reach the source page (network or CORS restriction)",
    };
  }

  // 2. Parse the HTML and resolve every href against the source URL.
  const doc = new DOMParser().parseFromString(html, "text/html");
  const hrefs = Array.from(doc.querySelectorAll("a[href]"))
    .map((a) => resolveHref(a.getAttribute("href") ?? "", sourceUrl))
    .filter((h): h is string => h !== null);

  const oldStillPresent = hrefs.some((h) => sameUrl(h, oldTargetUrl));
  if (oldStillPresent) {
    return { success: false, reason: "Old link still detected on live page" };
  }

  const newPresent = hrefs.some((h) => sameUrl(h, newTargetUrl));
  if (!newPresent) {
    return {
      success: false,
      reason: "Replacement link not found on live page yet — deploy the patch first",
    };
  }

  // 3. Confirm the replacement target itself is healthy.
  let status: number;
  try {
    const res = await fetch(newTargetUrl, { headers: { Accept: "text/html" } });
    status = res.status;
  } catch {
    return { success: false, reason: "Replacement URL could not be reached" };
  }
  if (status !== 200) {
    return { success: false, reason: `Replacement URL returned HTTP ${status}, expected 200` };
  }

  // 4. Persist the verified state (validating the transition first).
  const { data: row, error: readError } = await supabase
    .from("broken_links")
    .select("issue_state")
    .eq("id", issueId)
    .maybeSingle();
  if (readError) return { success: false, reason: readError.message };

  const current = (row?.issue_state ?? "awaiting_fix") as IssueLifecycleState;
  if (current !== "verified") {
    try {
      assertTransition(current, "verified");
    } catch (e) {
      return { success: false, reason: e instanceof Error ? e.message : String(e) };
    }
    const verifiedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("broken_links")
      .update({
        issue_state: "verified",
        state_updated_at: verifiedAt,
        verified_at: verifiedAt,
        verified_status: status,
      })
      .eq("id", issueId);
    if (updateError) return { success: false, reason: updateError.message };
    return { success: true, status, verifiedAt };
  }

  return { success: true, status, verifiedAt: new Date().toISOString() };
}

/**
 * Move an issue to a new lifecycle state, enforcing the state machine.
 * Reads the current state from the database so illegal jumps are rejected.
 */
export async function transitionIssueState(
  issueId: string,
  kind: "link" | "seo",
  next: IssueLifecycleState,
): Promise<{ ok: true }> {
  const table = kind === "seo" ? "seo_issues" : "broken_links";
  const { data: row, error: readError } = await supabase
    .from(table)
    .select("issue_state")
    .eq("id", issueId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const current = (row?.issue_state ?? "detected") as IssueLifecycleState;
  if (current === next) return { ok: true };
  assertTransition(current, next);

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(table)
    .update({ issue_state: next, state_updated_at: now })
    .eq("id", issueId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
