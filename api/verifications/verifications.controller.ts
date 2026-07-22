import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { ChangeVerificationStatusDto, ReviewProviderDocumentDto } from "./verifications.dto.js";
import { VerificationsService } from "./verifications.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1/provider/verification")
export class ProviderVerificationController {
  constructor(private readonly verifications: VerificationsService) {}

  @Get()
  async status(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return { verification: await this.verifications.providerStatus(actorFromHeaders(role, id)) };
  }
}

@Controller("api/v1/operation/verifications")
export class OperationVerificationsController {
  constructor(private readonly verifications: VerificationsService) {}

  @Get()
  async queue(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return { verifications: await this.verifications.queue(actorFromHeaders(role, id)) };
  }

  @Get(":verificationId")
  async detail(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("verificationId") verificationId: string,
  ) {
    return { verification: await this.verifications.detail(actorFromHeaders(role, id), verificationId) };
  }

  @Post(":verificationId/transitions")
  async changeStatus(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("verificationId") verificationId: string,
    @Body() input: ChangeVerificationStatusDto,
  ) {
    return { verification: await this.verifications.changeStatus(actorFromHeaders(role, id), verificationId, input.status, input.note) };
  }

  @Post(":verificationId/documents/:documentId/reviews")
  async reviewDocument(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("verificationId") verificationId: string,
    @Param("documentId") documentId: string,
    @Body() input: ReviewProviderDocumentDto,
  ) {
    return { verification: await this.verifications.reviewDocument(actorFromHeaders(role, id), verificationId, documentId, input.status, input.note) };
  }
}
