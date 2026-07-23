import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { CapturePublicReferralDto, InviteReferralDto } from "./partners.dto.js";
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

@Controller("api/v1/public/referrals")
export class PublicReferralsController {
  constructor(private readonly partners: PartnersService) {}

  @Get(":code")
  async details(
    @Headers("x-bff-verified") verified: string | undefined,
    @Param("code") code: string,
  ) {
    ensureVerifiedPublicChannel(verified);
    return this.partners.publicDetails(code);
  }

  @Post(":code")
  async capture(
    @Headers("x-bff-verified") verified: string | undefined,
    @Param("code") code: string,
    @Body() input: CapturePublicReferralDto,
  ) {
    ensureVerifiedPublicChannel(verified);
    return { accepted: true, ...(await this.partners.capturePublic(code, input)) };
  }
}

function ensureVerifiedPublicChannel(verified: string | undefined) {
  if (verified !== "1") throw new UnauthorizedException("Canal público de indicação inválido.");
}
