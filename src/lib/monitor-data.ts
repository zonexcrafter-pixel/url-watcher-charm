import type { BrokenLinkRow, WebsiteRow } from "@/lib/monitor.functions";

export type { BrokenLinkRow, WebsiteRow };

const RED = "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400";
const ORANGE =
  "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400";
const AMBER =
  "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400";
const SLATE =
  "bg-slate-500/10 text-slate-600 border-slate-500/30 dark:text-slate-300";

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All status codes" },
  { value: "404", label: "404 Not Found" },
  { value: "403", label: "403 Forbidden" },
  { value: "410", label: "410 Gone" },
  { value: "500", label: "500 Server Error" },
  { value: "502", label: "502 Bad Gateway" },
  { value: "503", label: "503 Unavailable" },
  { value: "unreachable", label: "Unreachable" },
];

export function statusMeta(status: number | null): {
  label: string;
  className: string;
} {
  if (status === null) return { label: "ERR", className: SLATE };
  if (status === 403 || status === 401) return { label: String(status), className: ORANGE };
  if (status === 408 || status === 429) return { label: String(status), className: AMBER };
  if (status >= 500) return { label: String(status), className: RED };
  return { label: String(status), className: RED };
}

export const ERROR_TYPE_LABELS: Record<string, string> = {
  not_found: "Not found",
  gone: "Gone",
  forbidden: "Forbidden",
  unauthorized: "Unauthorized",
  server_error: "Server error",
  client_error: "Client error",
  unreachable: "Unreachable",
};

/** 100 = no broken links; drops 4 points per broken link found. */
export function healthScore(brokenCount: number): number {
  return Math.max(0, 100 - brokenCount * 4);
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
