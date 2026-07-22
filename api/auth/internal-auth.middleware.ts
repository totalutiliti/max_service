import { Injectable, type NestMiddleware } from "@nestjs/common";
import { verifyInternalSignature } from "./internal-signature.js";

interface MiddlewareRequest {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
}

interface MiddlewareResponse {
  status(code: number): MiddlewareResponse;
  json(payload: unknown): void;
}

@Injectable()
export class InternalAuthMiddleware implements NestMiddleware {
  use(request: MiddlewareRequest, response: MiddlewareResponse, next: () => void) {
    delete request.headers["x-bff-verified"];
    const path = request.originalUrl.split("?", 1)[0] ?? request.originalUrl;
    const role = header(request, "x-demo-role");
    const actorId = header(request, "x-demo-actor-id");
    const protectsSessionEndpoint = path.startsWith("/api/v1/auth/demo-sessions");

    if (!role && !actorId && !protectsSessionEndpoint) {
      next();
      return;
    }

    const timestamp = header(request, "x-bff-timestamp");
    const signature = header(request, "x-bff-signature");
    const secret = process.env.BFF_INTERNAL_SECRET;
    const issuedAt = /^\d{10}$/.test(timestamp) ? Number(timestamp) : 0;
    const withinReplayWindow = Math.abs(Math.floor(Date.now() / 1000) - issuedAt) <= 300;
    const valid = Boolean(
      secret
      && signature
      && withinReplayWindow
      && verifyInternalSignature(secret, timestamp, request.method, path, role, actorId, signature),
    );

    if (!valid) {
      response.status(401).json({ error: "Canal interno de identidade inválido." });
      return;
    }

    request.headers["x-bff-verified"] = "1";
    next();
  }
}

function header(request: MiddlewareRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
