import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { IdentitySessionService } from "./identity-session.service.js";

@Controller("api/v1/auth/production-sessions")
export class IdentitySessionController {
  constructor(private readonly sessions: IdentitySessionService) {}

  @Get("current")
  async current(
    @Headers("x-bff-verified") verified: string | undefined,
    @Headers("authorization") authorization: string | undefined,
  ) {
    requireInternal(verified);
    return { session: await this.sessions.resolve(bearerToken(authorization)) };
  }

  @Post("current/rotate")
  async rotate(
    @Headers("x-bff-verified") verified: string | undefined,
    @Headers("authorization") authorization: string | undefined,
  ) {
    requireInternal(verified);
    return this.sessions.rotate(bearerToken(authorization));
  }

  @Get("inventory")
  async inventory(
    @Headers("x-bff-verified") verified: string | undefined,
    @Headers("authorization") authorization: string | undefined,
  ) {
    requireInternal(verified);
    return this.sessions.inventory(bearerToken(authorization));
  }

  @Delete(":scope")
  async revoke(
    @Param("scope") scope: string,
    @Headers("x-bff-verified") verified: string | undefined,
    @Headers("authorization") authorization: string | undefined,
  ) {
    requireInternal(verified);
    const token = bearerToken(authorization);
    if (scope === "current") {
      await this.sessions.revokeCurrent(token);
      return { revoked: true, scope };
    }
    if (scope === "all") {
      return { revoked: true, scope, ...await this.sessions.revokeAll(token) };
    }
    throw new UnauthorizedException("Escopo de revogação inválido.");
  }
}

function requireInternal(verified: string | undefined) {
  if (verified !== "1") {
    throw new UnauthorizedException("Canal interno de sessão inválido.");
  }
}

function bearerToken(authorization: string | undefined) {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  if (!match?.[1]) throw new UnauthorizedException("Sessão de produção ausente.");
  return match[1];
}
