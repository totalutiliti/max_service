import { Body, Controller, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { SandboxFinancialEventDto } from "./finance.dto.js";
import { FinanceService } from "./finance.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1/finance")
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("dashboard")
  async dashboard(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.finance.dashboard(actorFromHeaders(role, id));
  }

  @Post("sandbox/events")
  async sandboxEvent(
    @Headers("x-sandbox-signature") signature: string | undefined,
    @Headers("x-sandbox-timestamp") timestamp: string | undefined,
    @Body() input: SandboxFinancialEventDto,
  ) {
    return this.finance.ingestSandboxEvent(input, signature, timestamp);
  }
}
