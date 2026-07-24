import { Injectable } from "@nestjs/common";
import {
  summarizeRequestTelemetry,
  type RequestTelemetrySample,
} from "./request-telemetry.js";

const maximumRetainedSamples = 1_000;

@Injectable()
export class RequestTelemetryService {
  private readonly processStartedAt = new Date().toISOString();
  private readonly samples: RequestTelemetrySample[] = [];

  record(sample: RequestTelemetrySample) {
    this.samples.push(sample);
    const overflow = this.samples.length - maximumRetainedSamples;
    if (overflow > 0) this.samples.splice(0, overflow);
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
}
