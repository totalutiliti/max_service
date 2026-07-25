import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { openMetricsContentType } from "./open-metrics.js";
import { OpenMetricsService } from "./open-metrics.service.js";
import { SystemHealthService } from "./system-health.service.js";

interface MetricsResponse {
  setHeader(name: string, value: string): void;
}

@Controller()
export class ObservabilityController {
  constructor(
    private readonly systemHealth: SystemHealthService,
    private readonly openMetrics: OpenMetricsService,
  ) {}

  @Get("health/live")
  liveness() {
    return this.systemHealth.liveness();
  }

  @Get("health")
  async legacyHealth() {
    return this.readiness();
  }

  @Get("health/ready")
  async readiness() {
    const report = await this.systemHealth.inspect();
    if (!report.summary.localTrafficReady) {
      throw new ServiceUnavailableException({
        status: "unavailable",
        service: "max-service-api",
        checkedAt: report.checkedAt,
        checks: report.checks
          .filter((check) => check.trafficBlocking)
          .map(({ id, status, detail }) => ({ id, status, detail })),
      });
    }
    return {
      status: "ready",
      service: "max-service-api",
      checkedAt: report.checkedAt,
      uptimeSeconds: report.uptimeSeconds,
      checks: report.checks
        .filter((check) => check.trafficBlocking)
        .map(({ id, status, latencyMs }) => ({ id, status, latencyMs })),
    };
  }

  @Get("internal/metrics")
  async metrics(
    @Headers("authorization") authorization: string | undefined,
    @Res({ passthrough: true }) response: MetricsResponse,
  ) {
    const access = this.openMetrics.access(authorization);
    if (access === "disabled") {
      throw new NotFoundException("Endpoint de métricas desativado.");
    }
    if (access === "misconfigured") {
      throw new ServiceUnavailableException("Exportador de métricas sem credencial válida.");
    }
    if (access === "unauthorized") {
      response.setHeader("www-authenticate", 'Bearer realm="max-service-metrics"');
      throw new UnauthorizedException("Credencial de métricas inválida.");
    }
    response.setHeader("content-type", openMetricsContentType);
    response.setHeader("cache-control", "no-store");
    return this.openMetrics.render();
  }

  @Get("api/v1/operation/system-health")
  async operationHealth(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    let actor;
    try {
      actor = parseDemoActor(role, id);
    } catch (error) {
      throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
    }
    if (actor.role !== "operation") {
      throw new ForbiddenException("Apenas a Operação pode consultar a saúde do sistema.");
    }
    return this.systemHealth.inspect(actor);
  }
}
