import { Injectable, type NestMiddleware } from "@nestjs/common";
import { requestRateLimitRules } from "./rate-limit.js";
import {
  RateLimitService,
  RateLimitUnavailableError,
} from "./rate-limit.service.js";

interface RateLimitRequest {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
}

interface RateLimitResponse {
  setHeader(name: string, value: string): void;
  status(code: number): RateLimitResponse;
  json(payload: unknown): void;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly rateLimits: RateLimitService) {}

  async use(request: RateLimitRequest, response: RateLimitResponse, next: () => void) {
    let decision;
    try {
      decision = await this.rateLimits.consume(requestRateLimitRules(request));
    } catch (error) {
      if (!(error instanceof RateLimitUnavailableError)) throw error;
      response.setHeader("retry-after", "1");
      response.setHeader("cache-control", "no-store");
      response.status(503).json({
        statusCode: 503,
        error: "Service Unavailable",
        code: "RATE_LIMIT_STORE_UNAVAILABLE",
        message: "Proteção contra abuso temporariamente indisponível.",
      });
      return;
    }
    if (!decision) {
      next();
      return;
    }

    response.setHeader("ratelimit-policy", `${decision.limit};w=${decision.windowSeconds}`);
    response.setHeader("ratelimit-limit", String(decision.limit));
    response.setHeader("ratelimit-remaining", String(decision.remaining));
    response.setHeader("ratelimit-reset", String(decision.resetAfterSeconds));

    if (!decision.allowed) {
      response.setHeader("retry-after", String(decision.resetAfterSeconds));
      response.setHeader("cache-control", "no-store");
      response.status(429).json({
        statusCode: 429,
        error: "Too Many Requests",
        code: "RATE_LIMITED",
        message: "Muitas tentativas. Aguarde antes de tentar novamente.",
      });
      return;
    }

    next();
  }
}
