import { Body, Controller, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { CompleteOnboardingDto } from "./onboarding.dto.js";
import { OnboardingService } from "./onboarding.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1/onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  async view(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.onboarding.view(actorFromHeaders(role, id));
  }

  @Post()
  async complete(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Body() input: CompleteOnboardingDto,
  ) {
    return this.onboarding.complete(actorFromHeaders(role, id), input);
  }
}
