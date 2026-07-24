import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { SystemHealthService } from "./system-health.service.js";

@Controller()
export class ObservabilityController {
  constructor(private readonly systemHealth: SystemHealthService) {}

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
    return this.systemHealth.inspect();
  }
}
