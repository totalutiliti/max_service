import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { CreateProposalDto, CreateServiceRequestDto } from "./marketplace.dto.js";
import { MarketplaceService } from "./marketplace.service.js";

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

  @Get("service-requests")
  async requests(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return { requests: await this.marketplace.listRequests(actorFromHeaders(role, id)) };
  }

  @Post("service-requests")
  async createRequest(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Body() input: CreateServiceRequestDto,
  ) {
    return { request: await this.marketplace.createRequest(actorFromHeaders(role, id), input) };
  }

  @Get("service-requests/:requestId/proposals")
  async proposals(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("requestId") requestId: string,
  ) {
    return { proposals: await this.marketplace.listProposals(actorFromHeaders(role, id), requestId) };
  }

  @Post("service-requests/:requestId/proposals")
  async createProposal(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("requestId") requestId: string,
    @Body() input: CreateProposalDto,
  ) {
    return { proposal: await this.marketplace.createProposal(actorFromHeaders(role, id), requestId, input) };
  }

  @Post("proposals/:proposalId/accept")
  async acceptProposal(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("proposalId") proposalId: string,
  ) {
    return { booking: await this.marketplace.acceptProposal(actorFromHeaders(role, id), proposalId) };
  }
}
