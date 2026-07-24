import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRoutePath,
  summarizeRequestTelemetry,
  type RequestTelemetrySample,
} from "../observability/request-telemetry.js";
import { RequestTelemetryService } from "../observability/request-telemetry.service.js";

test("normaliza identificadores e descarta query strings antes de registrar a rota", () => {
  const booking = normalizeRoutePath(
    "/api/v1/bookings/550e8400-e29b-41d4-a716-446655440000?email=secret@example.com",
  );
  assert.equal(booking, "/api/v1/bookings/:id");
  assert.equal(booking.includes("secret"), false);

  const referral = normalizeRoutePath(
    "/api/v1/public/referrals/MS-PRIVATE-CODE?document=12345678900",
  );
  assert.equal(referral, "/api/v1/public/referrals/:code");
  assert.equal(referral.includes("PRIVATE"), false);

  assert.equal(
    normalizeRoutePath("/api/v1/unknown/person@example.com"),
    "/api/v1/:value/:value",
  );
});

test("agrega tráfego da janela e separa probes sem reter atores ou payloads", () => {
  const now = Date.parse("2026-07-24T12:00:00.000Z");
  const sample = (
    route: string,
    statusCode: number,
    durationMs: number,
    recordedAt = now - 1_000,
  ): RequestTelemetrySample => ({
    recordedAt,
    method: "GET",
    route,
    statusCode,
    durationMs,
    actorRole: "operation",
    idempotencyReplayed: route === "/api/v1/bookings/:id" && statusCode === 200,
  });
  const summary = summarizeRequestTelemetry([
    sample("/health/live", 200, 2),
    sample("/api/v1/bookings/:id", 200, 100),
    sample("/api/v1/bookings/:id", 429, 200),
    sample("/api/v1/reports", 503, 1_200),
    sample("/api/v1/old", 200, 20, now - 6 * 60_000),
  ], now);

  assert.equal(summary.requestCount, 3);
  assert.equal(summary.probeCount, 1);
  assert.equal(summary.rejected4xxCount, 1);
  assert.equal(summary.rateLimitedCount, 1);
  assert.equal(summary.idempotencyReplayCount, 1);
  assert.equal(summary.error5xxCount, 1);
  assert.equal(summary.slowCount, 1);
  assert.equal(summary.averageLatencyMs, 500);
  assert.equal(summary.p95LatencyMs, 1_200);
  assert.deepEqual(summary.topRoutes[0], {
    method: "GET",
    route: "/api/v1/bookings/:id",
    requestCount: 2,
    averageLatencyMs: 150,
    errorCount: 0,
  });
});

test("limita a retenção local a mil amostras", () => {
  const service = new RequestTelemetryService();
  for (let index = 0; index < 1_010; index += 1) {
    service.record({
      recordedAt: index,
      method: "GET",
      route: "/api/v1/categories",
      statusCode: 200,
      durationMs: 1,
      actorRole: "anonymous",
      idempotencyReplayed: false,
    });
  }
  assert.equal(service.snapshot(1_010).retainedSamples, 1_000);
});
