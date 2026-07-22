import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { OperationsService } from "./operations.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1/operation")
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("cases")
  async cases(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return { cases: await this.operations.cases(actorFromHeaders(role, id)) };
  }
}
