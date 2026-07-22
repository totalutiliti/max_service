import { Body, Controller, Get, Headers, Param, PayloadTooLargeException, Post, Req, Res, StreamableFile, UnauthorizedException } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
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
    const bytes = await readLimitedBody(request);
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
    setDownloadHeaders(response, file.originalName, file.contentType, file.bytes.length);
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
    setDownloadHeaders(response, file.originalName, file.contentType, file.bytes.length);
    return new StreamableFile(file.bytes);
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

interface HeaderResponse {
  setHeader(name: string, value: string | number): void;
}

function decodeFileName(value: string | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

async function readLimitedBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 2_097_152) throw new PayloadTooLargeException("O arquivo excede o limite de 2 MB.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

function setDownloadHeaders(response: HeaderResponse, fileName: string, contentType: string, size: number) {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  response.setHeader("content-type", contentType);
  response.setHeader("content-length", size);
  response.setHeader("content-disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("x-content-type-options", "nosniff");
}
