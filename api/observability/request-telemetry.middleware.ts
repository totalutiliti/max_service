import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  normalizeRoutePath,
  type TelemetryActorRole,
} from "./request-telemetry.js";
import { RequestTelemetryService } from "./request-telemetry.service.js";

interface TelemetryRequest {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
}

interface TelemetryResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  once(event: "finish", listener: () => void): void;
}

const actorRoles = new Set<TelemetryActorRole>([
  "customer",
  "provider",
  "partner",
  "operation",
]);

@Injectable()
export class RequestTelemetryMiddleware implements NestMiddleware {
  constructor(private readonly telemetry: RequestTelemetryService) {}

  use(request: TelemetryRequest, response: TelemetryResponse, next: () => void) {
    const requestId = randomUUID();
    const route = normalizeRoutePath(request.originalUrl);
    const startedAt = process.hrtime.bigint();
    response.setHeader("x-request-id", requestId);

    response.once("finish", () => {
      const durationMs = Math.max(
        0,
        Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000),
      );
      const actorRole = resolvedActorRole(request);
      const sample = {
        recordedAt: Date.now(),
        method: request.method.toUpperCase(),
        route,
        statusCode: response.statusCode,
        durationMs,
        actorRole,
      };
      this.telemetry.record(sample);
      process.stdout.write(`${JSON.stringify({
        timestamp: new Date(sample.recordedAt).toISOString(),
        event: "http_request",
        requestId,
        method: sample.method,
        route: sample.route,
        statusCode: sample.statusCode,
        durationMs: sample.durationMs,
        actorRole: sample.actorRole,
      })}\n`);
    });

    next();
  }
}

function resolvedActorRole(request: TelemetryRequest): TelemetryActorRole {
  if (header(request, "x-bff-verified") !== "1") return "anonymous";
  const role = header(request, "x-demo-role") as TelemetryActorRole;
  return actorRoles.has(role) ? role : "anonymous";
}

function header(request: TelemetryRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
