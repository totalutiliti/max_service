import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
} from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { parseDemoActor } from "../auth/demo-actor.js";
import {
  decodeFileName,
  readLimitedBody,
  setPrivateFileHeaders,
  type HeaderResponse,
} from "../storage/private-file-http.js";
import { maximumPartnerSupportAttachmentBytes } from "./partner-support-attachment-validation.js";
import {
  AddPartnerSupportMessageDto,
  ChangePartnerSupportDisputeStatusDto,
  ChangePartnerSupportStatusDto,
  CreatePartnerSupportDisputeDto,
  CreatePartnerSupportCaseDto,
  TriagePartnerSupportCaseDto,
} from "./partner-support.dto.js";
import { PartnerSupportService } from "./partner-support.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1/partner/support")
export class PartnerSupportController {
  constructor(private readonly support: PartnerSupportService) {}

  @Get()
  async list(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.support.list(actorFromHeaders(role, id), "partner");
  }

  @Get("cases/:caseId")
  async detail(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
  ) {
    return { case: await this.support.detail(actorFromHeaders(role, id), caseId, "partner") };
  }

  @Post("cases")
  async create(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreatePartnerSupportCaseDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.support.create(actorFromHeaders(role, id), input, idempotencyKey);
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { case: result.value };
  }

  @Post("cases/:caseId/messages")
  async addMessage(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Body() input: AddPartnerSupportMessageDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.support.addMessage(
      actorFromHeaders(role, id),
      caseId,
      input.body,
      "partner",
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { event: result.value };
  }

  @Post("cases/:caseId/attachments")
  async addAttachment(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-file-name") encodedFileName: string | undefined,
    @Headers("x-message-body") encodedBody: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const bytes = await readLimitedBody(
      request,
      maximumPartnerSupportAttachmentBytes,
      "O arquivo excede o limite de 2 MB.",
    );
    const result = await this.support.addMessageWithAttachment(
      actorFromHeaders(role, id),
      caseId,
      decodeFileName(encodedBody),
      decodeFileName(encodedFileName),
      contentType ?? "",
      bytes,
      "partner",
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { event: result.value };
  }

  @Get("attachments/:attachmentId")
  async downloadAttachment(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("attachmentId", new ParseUUIDPipe({ version: "4" })) attachmentId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const file = await this.support.downloadAttachment(
      actorFromHeaders(role, id),
      attachmentId,
      "partner",
    );
    setPrivateFileHeaders(response, file.originalName, file.contentType, file.bytes.length, "inline");
    return new StreamableFile(file.bytes);
  }

  @Post("cases/:caseId/disputes")
  async createDispute(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Body() input: CreatePartnerSupportDisputeDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.support.createDispute(
      actorFromHeaders(role, id),
      caseId,
      input.reason,
      input.statement,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { dispute: result.value };
  }
}

@Controller("api/v1/operation/support")
export class OperationSupportController {
  constructor(private readonly support: PartnerSupportService) {}

  @Get()
  async list(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.support.list(actorFromHeaders(role, id), "operation");
  }

  @Get("cases/:caseId")
  async detail(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
  ) {
    return { case: await this.support.detail(actorFromHeaders(role, id), caseId, "operation") };
  }

  @Post("cases/:caseId/messages")
  async addMessage(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Body() input: AddPartnerSupportMessageDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.support.addMessage(
      actorFromHeaders(role, id),
      caseId,
      input.body,
      "operation",
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { event: result.value };
  }

  @Post("cases/:caseId/attachments")
  async addAttachment(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-file-name") encodedFileName: string | undefined,
    @Headers("x-message-body") encodedBody: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const bytes = await readLimitedBody(
      request,
      maximumPartnerSupportAttachmentBytes,
      "O arquivo excede o limite de 2 MB.",
    );
    const result = await this.support.addMessageWithAttachment(
      actorFromHeaders(role, id),
      caseId,
      decodeFileName(encodedBody),
      decodeFileName(encodedFileName),
      contentType ?? "",
      bytes,
      "operation",
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { event: result.value };
  }

  @Get("attachments/:attachmentId")
  async downloadAttachment(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("attachmentId", new ParseUUIDPipe({ version: "4" })) attachmentId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const file = await this.support.downloadAttachment(
      actorFromHeaders(role, id),
      attachmentId,
      "operation",
    );
    setPrivateFileHeaders(response, file.originalName, file.contentType, file.bytes.length, "inline");
    return new StreamableFile(file.bytes);
  }

  @Post("cases/:caseId/transitions")
  async changeStatus(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Body() input: ChangePartnerSupportStatusDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.support.changeStatus(
      actorFromHeaders(role, id),
      caseId,
      input.status,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { case: result.value };
  }

  @Post("cases/:caseId/triage")
  async triage(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Body() input: TriagePartnerSupportCaseDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.support.triage(
      actorFromHeaders(role, id),
      caseId,
      input.priority,
      input.assigneeId,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { case: result.value };
  }

  @Post("cases/:caseId/disputes/transitions")
  async changeDisputeStatus(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Body() input: ChangePartnerSupportDisputeStatusDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.support.changeDisputeStatus(
      actorFromHeaders(role, id),
      caseId,
      input.status,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { dispute: result.value };
  }
}
