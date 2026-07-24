import { Body, Controller, Get, Headers, Param, Post, Req, Res, StreamableFile, UnauthorizedException } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { parseDemoActor } from "../auth/demo-actor.js";
import { decodeFileName, readLimitedBody, setPrivateFileHeaders, type HeaderResponse } from "../storage/private-file-http.js";
import { maximumProviderDocumentBytes } from "./document-file-validation.js";
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

  @Post("documents/:documentId/files")
  async upload(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("x-file-name") encodedFileName: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("documentId") documentId: string,
    @Req() request: IncomingMessage,
  ) {
    const fileName = decodeFileName(encodedFileName);
    const bytes = await readLimitedBody(request, maximumProviderDocumentBytes, "O arquivo excede o limite de 2 MB.");
    return { verification: await this.verifications.uploadDocument(actorFromHeaders(role, id), documentId, fileName, contentType ?? "", bytes) };
  }

  @Get("files/:fileId")
  async download(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("fileId") fileId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const file = await this.verifications.downloadDocument(actorFromHeaders(role, id), fileId);
    setPrivateFileHeaders(response, file.originalName, file.contentType, file.bytes.length);
    return new StreamableFile(file.bytes);
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

  @Get("files/:fileId")
  async download(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("fileId") fileId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const file = await this.verifications.downloadDocument(actorFromHeaders(role, id), fileId);
    setPrivateFileHeaders(response, file.originalName, file.contentType, file.bytes.length);
    return new StreamableFile(file.bytes);
  }

  @Post(":verificationId/transitions")
  async changeStatus(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("verificationId") verificationId: string,
    @Body() input: ChangeVerificationStatusDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.verifications.changeStatus(
      actorFromHeaders(role, id),
      verificationId,
      input.status,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { verification: result.value };
  }

  @Post(":verificationId/documents/:documentId/reviews")
  async reviewDocument(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("verificationId") verificationId: string,
    @Param("documentId") documentId: string,
    @Body() input: ReviewProviderDocumentDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.verifications.reviewDocument(
      actorFromHeaders(role, id),
      verificationId,
      documentId,
      input.status,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { verification: result.value };
  }
}
