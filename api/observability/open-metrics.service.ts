import { Injectable } from "@nestjs/common";
import {
  renderOpenMetrics,
  resolveMetricsAccess,
} from "./open-metrics.js";
import { RequestTelemetryService } from "./request-telemetry.service.js";
import { SystemHealthService } from "./system-health.service.js";

@Injectable()
export class OpenMetricsService {
  constructor(
    private readonly telemetry: RequestTelemetryService,
    private readonly systemHealth: SystemHealthService,
  ) {}

  access(authorization: string | undefined) {
    return resolveMetricsAccess(process.env, authorization);
  }

  async render() {
    const [telemetry, health] = await Promise.all([
      Promise.resolve(this.telemetry.metricsSnapshot()),
      this.systemHealth.dependencySnapshot(),
    ]);
    return renderOpenMetrics(telemetry, health);
  }
}
