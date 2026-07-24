import { Injectable, type NestMiddleware } from "@nestjs/common";
import { apiSecurityHeaders } from "./http-security.js";

interface SecurityHeaderResponse {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class HttpSecurityMiddleware implements NestMiddleware {
  use(_request: unknown, response: SecurityHeaderResponse, next: () => void) {
    for (const [name, value] of Object.entries(apiSecurityHeaders(process.env))) {
      response.setHeader(name, value);
    }
    next();
  }
}
