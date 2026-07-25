import assert from "node:assert/strict";
import test from "node:test";
import {
  openMetricsContentType,
  renderOpenMetrics,
  resolveMetricsAccess,
} from "../observability/open-metrics.js";
import { RequestTelemetryService } from "../observability/request-telemetry.service.js";

test("protege o exportador com opt-in e bearer token de alta entropia", () => {
  const token = "x".repeat(32);
  assert.equal(resolveMetricsAccess({}, `Bearer ${token}`), "disabled");
  assert.equal(
    resolveMetricsAccess({ METRICS_ENABLED: "true", METRICS_BEARER_TOKEN: "short" }, "Bearer short"),
    "misconfigured",
  );
  assert.equal(
    resolveMetricsAccess({ METRICS_ENABLED: "true", METRICS_BEARER_TOKEN: token }, undefined),
    "unauthorized",
  );
  assert.equal(
    resolveMetricsAccess(
      { METRICS_ENABLED: "true", METRICS_BEARER_TOKEN: token },
      `Bearer ${token}`,
    ),
    "authorized",
  );
  assert.match(openMetricsContentType, /^application\/openmetrics-text;/);
});

test("exporta contadores monotônicos, histograma e dependências sem PII", () => {
  const telemetry = new RequestTelemetryService();
  telemetry.record({
    recordedAt: Date.now(),
    method: "POST",
    route: "/api/v1/bookings/:id",
    statusCode: 200,
    durationMs: 125,
    actorRole: "customer",
    idempotencyReplayed: true,
  });
  telemetry.record({
    recordedAt: Date.now(),
    method: "TRACE-UNEXPECTED",
    route: "/internal/metrics",
    statusCode: 401,
    durationMs: 5,
    actorRole: "anonymous",
    idempotencyReplayed: false,
  });

  const output = renderOpenMetrics(telemetry.metricsSnapshot(), {
    summary: {
      localTrafficReady: true,
      productionAuthorized: false,
      productionBlockers: 3,
    },
    checks: [{
      id: "database",
      area: "database",
      label: "PostgreSQL",
      status: "healthy",
      detail: "secret@example.com must never be exported",
      latencyMs: 12,
      trafficBlocking: true,
      productionBlocking: false,
    }],
  });

  assert.match(
    output,
    /max_service_http_requests_total\{method="POST",status_class="2xx",traffic="application"\} 1/,
  );
  assert.match(output, /# TYPE max_service_http_requests counter/);
  assert.equal(output.includes("# TYPE max_service_http_requests_total counter"), false);
  assert.match(
    output,
    /max_service_http_requests_total\{method="OTHER",status_class="4xx",traffic="metrics"\} 1/,
  );
  assert.match(output, /max_service_http_request_duration_seconds_bucket\{le="\+Inf"\} 2/);
  assert.match(output, /max_service_http_request_duration_seconds_count 2/);
  assert.match(output, /# UNIT max_service_http_request_duration_seconds seconds/);
  assert.match(output, /max_service_http_idempotency_replays_total 1/);
  assert.match(
    output,
    /max_service_dependency_status\{dependency="database",status="healthy"\} 1/,
  );
  assert.match(output, /max_service_local_traffic_ready 1/);
  assert.match(output, /max_service_production_authorized 0/);
  assert.equal(output.includes("secret@example.com"), false);
  assert.equal(output.endsWith("# EOF\n"), true);
});
