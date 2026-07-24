import { Body, Controller, Get, Headers, Param, Post, Res, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import type { HeaderResponse } from "../storage/private-file-http.js";
import { CampaignsService } from "./campaigns.service.js";
import { ChangeCampaignStatusDto, CreateCampaignDto, ValidateCouponDto } from "./campaigns.dto.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1")
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post("campaigns/validate")
  async validate(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Body() input: ValidateCouponDto,
  ) {
    return this.campaigns.validateCoupon(actorFromHeaders(role, id), input.code);
  }

  @Get("operation/campaigns")
  async list(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.campaigns.list(actorFromHeaders(role, id));
  }

  @Post("operation/campaigns")
  async create(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateCampaignDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.campaigns.create(
      actorFromHeaders(role, id),
      input,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { campaign: result.value };
  }

  @Post("operation/campaigns/:campaignId/actions")
  async changeStatus(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("campaignId") campaignId: string,
    @Body() input: ChangeCampaignStatusDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.campaigns.changeStatus(
      actorFromHeaders(role, id),
      campaignId,
      input.action,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { campaign: result.value };
  }
}
