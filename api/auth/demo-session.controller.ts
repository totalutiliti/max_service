import { Body, Controller, Delete, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { CreateDemoSessionDto } from "./demo-session.dto.js";
import { DemoSessionService } from "./demo-session.service.js";

@Controller("api/v1/auth/demo-sessions")
export class DemoSessionController {
  constructor(private readonly sessions: DemoSessionService) {}

  @Post()
  async create(
    @Headers("x-bff-verified") verified: string | undefined,
    @Headers("authorization") authorization: string | undefined,
    @Body() input: CreateDemoSessionDto,
  ) {
    requireInternal(verified);
    return this.sessions.create(input.role, bearerToken(authorization, false));
  }

  @Get("current")
  async current(
    @Headers("x-bff-verified") verified: string | undefined,
    @Headers("authorization") authorization: string | undefined,
  ) {
    requireInternal(verified);
    return { session: await this.sessions.resolve(bearerToken(authorization, true)!) };
  }

  @Delete("current")
  async revoke(
    @Headers("x-bff-verified") verified: string | undefined,
    @Headers("authorization") authorization: string | undefined,
  ) {
    requireInternal(verified);
    await this.sessions.revoke(bearerToken(authorization, true)!);
    return { revoked: true };
  }
}

function requireInternal(verified: string | undefined) {
  if (verified !== "1") throw new UnauthorizedException("Canal interno de sessão inválido.");
}

function bearerToken(authorization: string | undefined, required: boolean) {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  if (match) return match[1];
  if (required) throw new UnauthorizedException("Sessão demonstrativa ausente.");
  return undefined;
}
