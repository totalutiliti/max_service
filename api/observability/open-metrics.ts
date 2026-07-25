import { createHash, timingSafeEqual } from "node:crypto";
import type { SystemHealthCheck } from "./system-health.js";
import type { RequestTelemetryService } from "./request-telemetry.service.js";

export const openMetricsContentType =
  "application/openmetrics-text; version=1.0.0; charset=utf-8";

export type MetricsAccess =
  | "authorized"
  | "disabled"
  | "misconfigured"
  | "unauthorized";

export function resolveMetricsAccess(
  environment: NodeJS.ProcessEnv,
  authorization: string | undefined,
): MetricsAccess {
  if (environment.METRICS_ENABLED !== "true") return "disabled";
  const expectedToken = environment.METRICS_BEARER_TOKEN ?? "";
  if (expectedToken.length < 32) return "misconfigured";

  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  const suppliedToken = match?.[1] ?? "";
  const suppliedDigest = createHash("sha256").update(suppliedToken).digest();
  const expectedDigest = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest)
    ? "authorized"
    : "unauthorized";
}

export function renderOpenMetrics(
  telemetry: ReturnType<RequestTelemetryService["metricsSnapshot"]>,
  health: {
    summary: {
      localTrafficReady: boolean;
      productionAuthorized: false;
      productionBlockers: number;
    };
    checks: SystemHealthCheck[];
  },
) {
  const lines = [
    "# TYPE max_service_process_start_time_seconds gauge",
    "# UNIT max_service_process_start_time_seconds seconds",
    "# HELP max_service_process_start_time_seconds Unix timestamp when this API replica started.",
    sample("max_service_process_start_time_seconds", telemetry.processStartTimeSeconds),
    "# TYPE max_service_process_uptime_seconds gauge",
    "# UNIT max_service_process_uptime_seconds seconds",
    "# HELP max_service_process_uptime_seconds API replica uptime in seconds.",
    sample(
      "max_service_process_uptime_seconds",
      Math.max(0, Math.floor(Date.now() / 1_000 - telemetry.processStartTimeSeconds)),
    ),
    "# TYPE max_service_http_requests counter",
    "# HELP max_service_http_requests HTTP requests handled by this API replica.",
    ...telemetry.requestSeries.map((series) => sample(
      "max_service_http_requests_total",
      series.count,
      {
        method: series.method,
        status_class: series.statusClass,
        traffic: series.traffic,
      },
    )),
    "# TYPE max_service_http_request_duration_seconds histogram",
    "# UNIT max_service_http_request_duration_seconds seconds",
    "# HELP max_service_http_request_duration_seconds HTTP request duration in seconds.",
    ...telemetry.durationBuckets.map((bucket) => sample(
      "max_service_http_request_duration_seconds_bucket",
      bucket.count,
      { le: canonicalBucket(bucket.upperBoundSeconds) },
    )),
    sample(
      "max_service_http_request_duration_seconds_bucket",
      telemetry.durationCount,
      { le: "+Inf" },
    ),
    sample("max_service_http_request_duration_seconds_sum", telemetry.durationSumSeconds),
    sample("max_service_http_request_duration_seconds_count", telemetry.durationCount),
    "# TYPE max_service_http_idempotency_replays counter",
    "# HELP max_service_http_idempotency_replays Successful idempotent mutation replays.",
    sample(
      "max_service_http_idempotency_replays_total",
      telemetry.idempotencyReplayCount,
    ),
    "# TYPE max_service_telemetry_retained_samples gauge",
    "# HELP max_service_telemetry_retained_samples Samples retained for the local five-minute cockpit.",
    sample("max_service_telemetry_retained_samples", telemetry.retainedSamples),
    "# TYPE max_service_dependency_status gauge",
    "# HELP max_service_dependency_status Current dependency status as a labeled gauge.",
    ...health.checks.map((check) => sample(
      "max_service_dependency_status",
      1,
      { dependency: check.id, status: check.status },
    )),
    "# TYPE max_service_dependency_check_duration_seconds gauge",
    "# UNIT max_service_dependency_check_duration_seconds seconds",
    "# HELP max_service_dependency_check_duration_seconds Latest dependency check duration in seconds.",
    ...health.checks
      .filter((check) => check.latencyMs !== null)
      .map((check) => sample(
        "max_service_dependency_check_duration_seconds",
        (check.latencyMs ?? 0) / 1_000,
        { dependency: check.id },
      )),
    "# TYPE max_service_local_traffic_ready gauge",
    "# HELP max_service_local_traffic_ready Whether required local dependencies accept traffic.",
    sample("max_service_local_traffic_ready", health.summary.localTrafficReady ? 1 : 0),
    "# TYPE max_service_production_authorized gauge",
    "# HELP max_service_production_authorized Whether all production approvals are complete.",
    sample("max_service_production_authorized", health.summary.productionAuthorized ? 1 : 0),
    "# TYPE max_service_production_blockers gauge",
    "# HELP max_service_production_blockers Current number of unresolved production blockers.",
    sample("max_service_production_blockers", health.summary.productionBlockers),
    "# EOF",
    "",
  ];
  return lines.join("\n");
}

function sample(
  name: string,
  value: number,
  labels: Record<string, string> = {},
) {
  const encodedLabels = Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, labelValue]) => `${label}="${escapeLabel(labelValue)}"`)
    .join(",");
  return `${name}${encodedLabels ? `{${encodedLabels}}` : ""} ${formatNumber(value)}`;
}

function escapeLabel(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\"", "\\\"");
}

function formatNumber(value: number) {
  if (value === Number.POSITIVE_INFINITY) return "+Inf";
  if (value === Number.NEGATIVE_INFINITY) return "-Inf";
  if (Number.isNaN(value)) return "NaN";
  return String(value);
}

function canonicalBucket(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 10
    ? `${value}.0`
    : String(value);
}
