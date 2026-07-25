import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import type { HeaderResponse } from "../storage/private-file-http.js";
import {
  CreateDataSubjectRequestDto,
  TransitionDataSubjectRequestDto,
} from "./privacy.dto.js";
import { PrivacyService } from "./privacy.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1/privacy")
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get("requests")
  async requests(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.privacy.subjectCenter(actorFromHeaders(role, id));
  }

  @Post("requests")
  async createRequest(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateDataSubjectRequestDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.privacy.createRequest(
      actorFromHeaders(role, id),
      input,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { request: result.value };
  }

  @Post("requests/:requestId/export")
  async generateExport(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("requestId") requestId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.privacy.generateExport(
      actorFromHeaders(role, id),
      requestId,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return result.value;
  }
}

@Controller("api/v1/operation/privacy")
export class OperationPrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  async queue(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.privacy.operationQueue(actorFromHeaders(role, id));
  }

  @Post(":requestId/transitions")
  async transition(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("requestId") requestId: string,
    @Body() input: TransitionDataSubjectRequestDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.privacy.transitionRequest(
      actorFromHeaders(role, id),
      requestId,
      input,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { request: result.value };
  }
}
