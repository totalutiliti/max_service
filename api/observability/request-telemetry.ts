export type TelemetryActorRole =
  | "anonymous"
  | "customer"
  | "provider"
  | "partner"
  | "operation";

export interface RequestTelemetrySample {
  recordedAt: number;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  actorRole: TelemetryActorRole;
  idempotencyReplayed: boolean;
}

export interface RequestTelemetryRouteSummary {
  method: string;
  route: string;
  requestCount: number;
  averageLatencyMs: number;
  errorCount: number;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const safeStaticSegments = new Set([
  "accept",
  "actions",
  "activity",
  "api",
  "attachments",
  "auth",
  "blocks",
  "bookings",
  "campaigns",
  "cancel",
  "cancellations",
  "cases",
  "categories",
  "conversations",
  "current",
  "dashboard",
  "demo-sessions",
  "documents",
  "events",
  "files",
  "finance",
  "goals",
  "health",
  "live",
  "matching",
  "message-attachments",
  "messages",
  "notes",
  "notifications",
  "onboarding",
  "operation",
  "partner",
  "preferences",
  "proposals",
  "provider",
  "public",
  "push",
  "qr",
  "read",
  "read-all",
  "readiness",
  "ready",
  "referrals",
  "region-neighborhoods",
  "regions",
  "reports",
  "reviews",
  "sandbox",
  "schedule",
  "service-request-attachments",
  "service-requests",
  "slots",
  "status",
  "subscribe",
  "support",
  "system-health",
  "transitions",
  "triage",
  "unsubscribe",
  "v1",
  "validate",
  "verification",
  "verifications",
  "weekly",
]);

export function normalizeRoutePath(originalUrl: string) {
  const rawPath = originalUrl.split("?", 1)[0] || "/";
  const segments = rawPath.split("/").filter(Boolean);
  if (segments.length === 0) return "/";

  return `/${segments.map((segment, index) => {
    if (uuidPattern.test(segment)) return ":id";
    if (/^\d+$/.test(segment)) return ":number";

    const normalized = segment.toLowerCase();
    const isPublicReferralCode = normalized !== "qr"
      && segments[index - 1]?.toLowerCase() === "referrals"
      && segments[index - 2]?.toLowerCase() === "public";
    if (isPublicReferralCode) return ":code";

    return safeStaticSegments.has(normalized) ? normalized : ":value";
  }).join("/")}`;
}

export function summarizeRequestTelemetry(
  samples: RequestTelemetrySample[],
  now = Date.now(),
  windowMs = 5 * 60 * 1_000,
) {
  const windowStart = now - windowMs;
  const recent = samples.filter((sample) => sample.recordedAt >= windowStart);
  const probes = recent.filter((sample) => sample.route === "/health" || sample.route.startsWith("/health/"));
  const requests = recent.filter((sample) => !probes.includes(sample));
  const durations = requests.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const routes = new Map<string, RequestTelemetrySample[]>();

  for (const sample of requests) {
    const key = `${sample.method} ${sample.route}`;
    routes.set(key, [...(routes.get(key) ?? []), sample]);
  }

  const topRoutes: RequestTelemetryRouteSummary[] = [...routes.entries()]
    .map(([key, routeSamples]) => {
      const separator = key.indexOf(" ");
      return {
        method: key.slice(0, separator),
        route: key.slice(separator + 1),
        requestCount: routeSamples.length,
        averageLatencyMs: average(routeSamples.map((sample) => sample.durationMs)),
        errorCount: routeSamples.filter((sample) => sample.statusCode >= 500).length,
      };
    })
    .sort((left, right) => (
      right.requestCount - left.requestCount
      || right.errorCount - left.errorCount
      || left.route.localeCompare(right.route)
    ))
    .slice(0, 5);

  return {
    windowMinutes: Math.round(windowMs / 60_000),
    requestCount: requests.length,
    probeCount: probes.length,
    rejected4xxCount: requests.filter(
      (sample) => sample.statusCode >= 400 && sample.statusCode < 500,
    ).length,
    rateLimitedCount: requests.filter((sample) => sample.statusCode === 429).length,
    idempotencyReplayCount: requests.filter((sample) => sample.idempotencyReplayed).length,
    error5xxCount: requests.filter((sample) => sample.statusCode >= 500).length,
    slowCount: requests.filter((sample) => sample.durationMs >= 1_000).length,
    averageLatencyMs: average(durations),
    p95LatencyMs: percentile95(durations),
    topRoutes,
  };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function percentile95(sortedValues: number[]) {
  if (sortedValues.length === 0) return 0;
  return Math.round(sortedValues[Math.ceil(sortedValues.length * 0.95) - 1] ?? 0);
}
