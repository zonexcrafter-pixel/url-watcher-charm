export type ScanStatus = "active" | "scanning" | "error";

export interface MonitoredSite {
  id: string;
  domain: string;
  status: ScanStatus;
  lastScanned: string; // ISO
  pagesScanned: number;
  brokenLinks: number;
  healthScore: number; // 0-100
}

export interface BrokenLink {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  domain: string;
  statusCode: number;
  detectedAt: string; // ISO
  anchorText: string;
}

export const monitoredSites: MonitoredSite[] = [
  {
    id: "site-1",
    domain: "acmestore.com",
    status: "active",
    lastScanned: "2026-09-11T09:42:00Z",
    pagesScanned: 1284,
    brokenLinks: 14,
    healthScore: 96,
  },
  {
    id: "site-2",
    domain: "blog.acmestore.com",
    status: "scanning",
    lastScanned: "2026-09-11T11:58:00Z",
    pagesScanned: 642,
    brokenLinks: 3,
    healthScore: 98,
  },
  {
    id: "site-3",
    domain: "docs.nimbusly.io",
    status: "active",
    lastScanned: "2026-09-10T22:15:00Z",
    pagesScanned: 3910,
    brokenLinks: 41,
    healthScore: 88,
  },
  {
    id: "site-4",
    domain: "helpdesk.zentro.app",
    status: "error",
    lastScanned: "2026-09-09T14:03:00Z",
    pagesScanned: 512,
    brokenLinks: 9,
    healthScore: 74,
  },
  {
    id: "site-5",
    domain: "careers.orbitalhq.com",
    status: "active",
    lastScanned: "2026-09-11T06:30:00Z",
    pagesScanned: 208,
    brokenLinks: 2,
    healthScore: 99,
  },
  {
    id: "site-6",
    domain: "status.finchpay.dev",
    status: "active",
    lastScanned: "2026-09-11T10:05:00Z",
    pagesScanned: 96,
    brokenLinks: 0,
    healthScore: 100,
  },
];

export const brokenLinks: BrokenLink[] = [
  {
    id: "bl-1",
    sourceUrl: "https://acmestore.com/products/summer-collection",
    targetUrl: "https://acmestore.com/assets/lookbook-2025.pdf",
    domain: "acmestore.com",
    statusCode: 404,
    detectedAt: "2026-09-11T09:42:12Z",
    anchorText: "Download the lookbook",
  },
  {
    id: "bl-2",
    sourceUrl: "https://acmestore.com/checkout",
    targetUrl: "https://payments.example-cdn.com/sdk/v2.js",
    domain: "acmestore.com",
    statusCode: 500,
    detectedAt: "2026-09-11T09:41:48Z",
    anchorText: "(script resource)",
  },
  {
    id: "bl-3",
    sourceUrl: "https://acmestore.com/blog/spring-trends",
    targetUrl: "https://oldblog.acmestore.com/trends/2024",
    domain: "acmestore.com",
    statusCode: 301,
    detectedAt: "2026-09-11T09:40:31Z",
    anchorText: "last year's trends",
  },
  {
    id: "bl-4",
    sourceUrl: "https://acmestore.com/about",
    targetUrl: "https://linkedin.com/company/acme-store-old",
    domain: "acmestore.com",
    statusCode: 404,
    detectedAt: "2026-09-11T09:38:04Z",
    anchorText: "Follow us on LinkedIn",
  },
  {
    id: "bl-5",
    sourceUrl: "https://blog.acmestore.com/seo-checklist",
    targetUrl: "https://tools.seowidget.io/free-audit",
    domain: "blog.acmestore.com",
    statusCode: 403,
    detectedAt: "2026-09-11T11:58:44Z",
    anchorText: "free SEO audit tool",
  },
  {
    id: "bl-6",
    sourceUrl: "https://blog.acmestore.com/migration-guide",
    targetUrl: "https://acmestore.com/help/migrating",
    domain: "blog.acmestore.com",
    statusCode: 404,
    detectedAt: "2026-09-11T11:57:02Z",
    anchorText: "migration help center",
  },
  {
    id: "bl-7",
    sourceUrl: "https://docs.nimbusly.io/api/authentication",
    targetUrl: "https://docs.nimbusly.io/api/v1/tokens",
    domain: "docs.nimbusly.io",
    statusCode: 404,
    detectedAt: "2026-09-10T22:15:37Z",
    anchorText: "API tokens reference",
  },
  {
    id: "bl-8",
    sourceUrl: "https://docs.nimbusly.io/getting-started",
    targetUrl: "https://github.com/nimbusly/quickstart-example",
    domain: "docs.nimbusly.io",
    statusCode: 404,
    detectedAt: "2026-09-10T22:14:55Z",
    anchorText: "quickstart example repo",
  },
  {
    id: "bl-9",
    sourceUrl: "https://docs.nimbusly.io/sdks/python",
    targetUrl: "https://pypi.org/project/nimbusly-sdk-legacy",
    domain: "docs.nimbusly.io",
    statusCode: 410,
    detectedAt: "2026-09-10T22:13:19Z",
    anchorText: "nimbusly-sdk on PyPI",
  },
  {
    id: "bl-10",
    sourceUrl: "https://docs.nimbusly.io/webhooks",
    targetUrl: "https://docs.nimbusly.io/api/v1/webhook-events",
    domain: "docs.nimbusly.io",
    statusCode: 500,
    detectedAt: "2026-09-10T22:12:41Z",
    anchorText: "webhook event types",
  },
  {
    id: "bl-11",
    sourceUrl: "https://docs.nimbusly.io/changelog/v3",
    targetUrl: "https://cdn.nimbusly.io/changelog/v3-banner.png",
    domain: "docs.nimbusly.io",
    statusCode: 404,
    detectedAt: "2026-09-10T22:11:08Z",
    anchorText: "(image resource)",
  },
  {
    id: "bl-12",
    sourceUrl: "https://docs.nimbusly.io/guides/rate-limits",
    targetUrl: "https://status.nimbusly.io/incidents/2024-11",
    domain: "docs.nimbusly.io",
    statusCode: 408,
    detectedAt: "2026-09-10T22:09:52Z",
    anchorText: "November incident report",
  },
  {
    id: "bl-13",
    sourceUrl: "https://helpdesk.zentro.app/articles/billing",
    targetUrl: "https://helpdesk.zentro.app/articles/refund-policy-2023",
    domain: "helpdesk.zentro.app",
    statusCode: 404,
    detectedAt: "2026-09-09T14:03:26Z",
    anchorText: "refund policy",
  },
  {
    id: "bl-14",
    sourceUrl: "https://helpdesk.zentro.app/articles/sso-setup",
    targetUrl: "https://downloads.zentro.app/sso/metadata.xml",
    domain: "helpdesk.zentro.app",
    statusCode: 503,
    detectedAt: "2026-09-09T14:02:11Z",
    anchorText: "SAML metadata file",
  },
  {
    id: "bl-15",
    sourceUrl: "https://helpdesk.zentro.app/home",
    targetUrl: "https://zentro.app/webinars/onboarding-live",
    domain: "helpdesk.zentro.app",
    statusCode: 301,
    detectedAt: "2026-09-09T14:00:47Z",
    anchorText: "Join a live onboarding",
  },
  {
    id: "bl-16",
    sourceUrl: "https://careers.orbitalhq.com/engineering",
    targetUrl: "https://careers.orbitalhq.com/jobs/senior-frontend-2024",
    domain: "careers.orbitalhq.com",
    statusCode: 404,
    detectedAt: "2026-09-11T06:30:19Z",
    anchorText: "Senior Frontend Engineer",
  },
  {
    id: "bl-17",
    sourceUrl: "https://careers.orbitalhq.com/culture",
    targetUrl: "https://instagram.com/orbitalhq.life",
    domain: "careers.orbitalhq.com",
    statusCode: 403,
    detectedAt: "2026-09-11T06:29:33Z",
    anchorText: "Life at Orbital",
  },
  {
    id: "bl-18",
    sourceUrl: "https://acmestore.com/gift-cards",
    targetUrl: "https://acmestore.com/partners/giftly",
    domain: "acmestore.com",
    statusCode: 502,
    detectedAt: "2026-09-11T09:36:58Z",
    anchorText: "Buy via Giftly",
  },
  {
    id: "bl-19",
    sourceUrl: "https://docs.nimbusly.io/guides/migration-v2-v3",
    targetUrl: "https://docs.nimbusly.io/api/v2/endpoints",
    domain: "docs.nimbusly.io",
    statusCode: 410,
    detectedAt: "2026-09-10T22:08:14Z",
    anchorText: "v2 endpoint reference",
  },
  {
    id: "bl-20",
    sourceUrl: "https://blog.acmestore.com/customer-stories/brightside",
    targetUrl: "https://brightside.example.com/case-study",
    domain: "blog.acmestore.com",
    statusCode: 404,
    detectedAt: "2026-09-11T11:55:40Z",
    anchorText: "Read the full case study",
  },
];

export const statusCodeMeta: Record<
  number,
  { label: string; className: string }
> = {
  301: {
    label: "301 Redirect",
    className:
      "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  },
  403: {
    label: "403 Forbidden",
    className:
      "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400",
  },
  404: {
    label: "404 Not Found",
    className: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400",
  },
  408: {
    label: "408 Timeout",
    className:
      "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  },
  410: {
    label: "410 Gone",
    className: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400",
  },
  500: {
    label: "500 Server Error",
    className: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400",
  },
  502: {
    label: "502 Bad Gateway",
    className: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400",
  },
  503: {
    label: "503 Unavailable",
    className:
      "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400",
  },
};

export function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
