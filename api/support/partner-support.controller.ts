import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import {
  AddPartnerSupportMessageDto,
  ChangePartnerSupportStatusDto,
  CreatePartnerSupportCaseDto,
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
    @Body() input: CreatePartnerSupportCaseDto,
  ) {
    return { case: await this.support.create(actorFromHeaders(role, id), input) };
  }

  @Post("cases/:caseId/messages")
  async addMessage(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Body() input: AddPartnerSupportMessageDto,
  ) {
    return { event: await this.support.addMessage(actorFromHeaders(role, id), caseId, input.body, "partner") };
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
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Body() input: AddPartnerSupportMessageDto,
  ) {
    return { event: await this.support.addMessage(actorFromHeaders(role, id), caseId, input.body, "operation") };
  }

  @Post("cases/:caseId/transitions")
  async changeStatus(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("caseId", new ParseUUIDPipe({ version: "4" })) caseId: string,
    @Body() input: ChangePartnerSupportStatusDto,
  ) {
    return {
      case: await this.support.changeStatus(actorFromHeaders(role, id), caseId, input.status, input.note),
    };
  }
}
