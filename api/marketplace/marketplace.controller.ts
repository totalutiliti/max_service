import { Body, Controller, Get, Headers, Param, Post, Req, Res, StreamableFile, UnauthorizedException } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { parseDemoActor } from "../auth/demo-actor.js";
import { decodeFileName, readLimitedBody, setPrivateFileHeaders, type HeaderResponse } from "../storage/private-file-http.js";
import { AcceptProposalDto, CreateProposalDto, CreateServiceRequestDto, UpdateProviderMatchingDto } from "./marketplace.dto.js";
import { MarketplaceService } from "./marketplace.service.js";
import { maximumRequestAttachmentBytes } from "./request-attachment-validation.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1")
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get("categories")
  async categories() {
    return { categories: await this.marketplace.categories() };
  }

  @Get("regions")
  async regions() {
    return { regions: await this.marketplace.regions() };
  }

  @Get("service-requests")
  async requests(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return { requests: await this.marketplace.listRequests(actorFromHeaders(role, id)) };
  }

  @Get("provider/matching")
  async providerMatching(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.marketplace.providerMatching(actorFromHeaders(role, id));
  }

  @Post("provider/matching")
  async updateProviderMatching(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Body() input: UpdateProviderMatchingDto,
  ) {
    return this.marketplace.updateProviderMatching(actorFromHeaders(role, id), input);
  }

  @Post("service-requests")
  async createRequest(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateServiceRequestDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.marketplace.createRequest(actorFromHeaders(role, id), input, idempotencyKey);
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { request: result.value };
  }

  @Post("service-requests/:requestId/attachments")
  async uploadRequestAttachment(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-file-name") encodedFileName: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("requestId") requestId: string,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const bytes = await readLimitedBody(request, maximumRequestAttachmentBytes, "A imagem excede o limite de 512 KB.");
    const result = await this.marketplace.uploadRequestAttachment(
      actorFromHeaders(role, id),
      requestId,
      decodeFileName(encodedFileName),
      contentType ?? "",
      bytes,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { attachment: result.value };
  }

  @Get("service-request-attachments/:attachmentId")
  async downloadRequestAttachment(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("attachmentId") attachmentId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const file = await this.marketplace.downloadRequestAttachment(actorFromHeaders(role, id), attachmentId);
    setPrivateFileHeaders(response, file.originalName, file.contentType, file.bytes.length, "inline");
    return new StreamableFile(file.bytes);
  }

  @Get("service-requests/:requestId/proposals")
  async proposals(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("requestId") requestId: string,
  ) {
    return { proposals: await this.marketplace.listProposals(actorFromHeaders(role, id), requestId) };
  }

  @Get("proposals/:proposalId/slots")
  async proposalSlots(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("proposalId") proposalId: string,
  ) {
    return this.marketplace.proposalSlots(actorFromHeaders(role, id), proposalId);
  }

  @Post("service-requests/:requestId/proposals")
  async createProposal(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("requestId") requestId: string,
    @Body() input: CreateProposalDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.marketplace.createProposal(actorFromHeaders(role, id), requestId, input, idempotencyKey);
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { proposal: result.value };
  }

  @Post("proposals/:proposalId/accept")
  async acceptProposal(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("proposalId") proposalId: string,
    @Body() input: AcceptProposalDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.marketplace.acceptProposal(
      actorFromHeaders(role, id),
      proposalId,
      input.scheduledFor,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { booking: result.value };
  }
}
