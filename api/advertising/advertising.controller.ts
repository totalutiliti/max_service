import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import type { HeaderResponse } from "../storage/private-file-http.js";
import { AdvertisingService } from "./advertising.service.js";
import {
  ContextualAdQueryDto,
  CreateContextualAdCampaignDto,
  ModerateContextualAdDto,
  TrackContextualAdClickDto,
} from "./advertising.dto.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso invÃ¡lido.");
  }
}

@Controller("api/v1")
export class AdvertisingController {
  constructor(private readonly advertising: AdvertisingService) {}

  @Get("advertising/contextual")
  async contextual(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Query() query: ContextualAdQueryDto,
  ) {
    return this.advertising.deliver(actorFromHeaders(role, id), query);
  }

  @Post("advertising/clicks")
  async click(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Body() input: TrackContextualAdClickDto,
  ) {
    return this.advertising.trackClick(actorFromHeaders(role, id), input.deliveryToken);
  }

  @Get("advertiser/campaigns")
  async advertiserList(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.advertising.listForAdvertiser(actorFromHeaders(role, id));
  }

  @Post("advertiser/campaigns")
  async create(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateContextualAdCampaignDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.advertising.create(
      actorFromHeaders(role, id),
      input,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { campaign: result.value };
  }

  @Get("operation/advertising")
  async operationList(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.advertising.listForOperation(actorFromHeaders(role, id));
  }

  @Post("operation/advertising/:campaignId/actions")
  async moderate(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("campaignId") campaignId: string,
    @Body() input: ModerateContextualAdDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.advertising.moderate(
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
