import { Injectable } from "@nestjs/common";
import {
  summarizeRequestTelemetry,
  type RequestTelemetrySample,
} from "./request-telemetry.js";

const maximumRetainedSamples = 1_000;
const histogramUpperBoundsSeconds = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;
const supportedMethods = new Set(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);

export interface RequestMetricsSeries {
  method: string;
  statusClass: string;
  traffic: RequestTraffic;
  count: number;
}

export type RequestTraffic = "application" | "metrics" | "probe";

interface RequestDurationMetrics {
  traffic: RequestTraffic;
  bucketCounts: number[];
  count: number;
  sumSeconds: number;
}

@Injectable()
export class RequestTelemetryService {
  private readonly processStartedAt = new Date().toISOString();
  private readonly samples: RequestTelemetrySample[] = [];
  private readonly requestCounts = new Map<string, RequestMetricsSeries>();
  private readonly durationByTraffic = new Map<RequestTraffic, RequestDurationMetrics>([
    ["application", emptyDurationMetrics("application")],
    ["metrics", emptyDurationMetrics("metrics")],
    ["probe", emptyDurationMetrics("probe")],
  ]);
  private readonly applicationRequests = { success: 0, error: 0 };
  private idempotencyReplayCount = 0;

  record(sample: RequestTelemetrySample) {
    this.samples.push(sample);
    const overflow = this.samples.length - maximumRetainedSamples;
    if (overflow > 0) this.samples.splice(0, overflow);

    const method = supportedMethods.has(sample.method) ? sample.method : "OTHER";
    const statusClass = sample.statusCode >= 100 && sample.statusCode <= 599
      ? `${Math.floor(sample.statusCode / 100)}xx`
      : "other";
    const traffic = sample.route === "/internal/metrics"
      ? "metrics"
      : sample.route === "/health" || sample.route.startsWith("/health/")
      ? "probe"
      : "application";
    const seriesKey = `${method}\u0000${statusClass}\u0000${traffic}`;
    const current = this.requestCounts.get(seriesKey);
    this.requestCounts.set(seriesKey, current
      ? { ...current, count: current.count + 1 }
      : { method, statusClass, traffic, count: 1 });

    const durationSeconds = sample.durationMs / 1_000;
    const durationMetrics = this.durationByTraffic.get(traffic);
    if (!durationMetrics) throw new Error(`Tipo de tráfego sem histograma: ${traffic}`);
    durationMetrics.count += 1;
    durationMetrics.sumSeconds += durationSeconds;
    for (let index = 0; index < histogramUpperBoundsSeconds.length; index += 1) {
      if (durationSeconds <= histogramUpperBoundsSeconds[index]) {
        durationMetrics.bucketCounts[index] += 1;
      }
    }
    if (traffic === "application") {
      this.applicationRequests[sample.statusCode >= 500 ? "error" : "success"] += 1;
    }
    if (sample.idempotencyReplayed) this.idempotencyReplayCount += 1;
  }

  snapshot(now = Date.now()) {
    return {
      policyVersion: "REQUEST-TELEMETRY-2026-01",
      processStartedAt: this.processStartedAt,
      retainedSamples: this.samples.length,
      ...summarizeRequestTelemetry(this.samples, now),
      note: "Métricas desta réplica, limitadas em memória e reiniciadas com o processo.",
    };
  }

  metricsSnapshot() {
    return {
      processStartTimeSeconds: Date.parse(this.processStartedAt) / 1_000,
      retainedSamples: this.samples.length,
      requestSeries: [...this.requestCounts.values()].sort((left, right) => (
        left.method.localeCompare(right.method)
        || left.statusClass.localeCompare(right.statusClass)
        || left.traffic.localeCompare(right.traffic)
      )),
      applicationRequests: { ...this.applicationRequests },
      durationSeries: [...this.durationByTraffic.values()].map((series) => ({
        traffic: series.traffic,
        buckets: histogramUpperBoundsSeconds.map((upperBoundSeconds, index) => ({
          upperBoundSeconds,
          count: series.bucketCounts[index],
        })),
        count: series.count,
        sumSeconds: series.sumSeconds,
      })),
      idempotencyReplayCount: this.idempotencyReplayCount,
    };
  }
}

function emptyDurationMetrics(traffic: RequestTraffic): RequestDurationMetrics {
  return {
    traffic,
    bucketCounts: histogramUpperBoundsSeconds.map(() => 0),
    count: 0,
    sumSeconds: 0,
  };
}
