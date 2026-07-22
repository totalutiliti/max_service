import { Body, Controller, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { InviteReferralDto } from "./partners.dto.js";
import { PartnersService } from "./partners.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1/partner")
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get("dashboard")
  async dashboard(@Headers("x-demo-role") role: string | undefined, @Headers("x-demo-actor-id") id: string | undefined) {
    return this.partners.dashboard(actorFromHeaders(role, id));
  }

  @Post("referrals")
  async invite(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Body() input: InviteReferralDto,
  ) {
    return { referral: await this.partners.invite(actorFromHeaders(role, id), input) };
  }
}
