import { Body, Controller, Get, Headers, Param, Post, Query, Res, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import type { HeaderResponse } from "../storage/private-file-http.js";
import {
  AddSupportCaseNoteDto,
  ChangePartnerReferralStatusDto,
  ChangeSupportCaseStatusDto,
  ManageServiceCategoryDto,
  ManageServiceRegionDto,
  UpdateOperationReadinessGateDto,
  UpdateOperationReportGoalsDto,
} from "./operations.dto.js";
import { OperationsService } from "./operations.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1/operation")
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("activity")
  async activity(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.operations.activity(actorFromHeaders(role, id));
  }

  @Get("readiness")
  async readiness(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.operations.readiness(actorFromHeaders(role, id));
  }

  @Post("readiness/:gateKey")
  async updateReadinessGate(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("gateKey") gateKey: string,
    @Body() input: UpdateOperationReadinessGateDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.operations.updateReadinessGate(
      actorFromHeaders(role, id),
      gateKey,
      input,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return result.value;
  }

  @Get("reports")
  async reports(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Query("days") days: string | undefined,
  ) {
    return this.operations.reports(actorFromHeaders(role, id), days);
  }

  @Post("reports/goals")
  async updateReportGoals(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: UpdateOperationReportGoalsDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.operations.updateReportGoals(
      actorFromHeaders(role, id),
      input,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { goals: result.value };
  }

  @Get("categories")
  async categories(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.operations.categories(actorFromHeaders(role, id));
  }

  @Get("regions")
  async regions(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.operations.regions(actorFromHeaders(role, id));
  }

  @Get("matching")
  async matching(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.operations.matching(actorFromHeaders(role, id));
  }

  @Post("regions/:regionId/actions")
  async manageRegion(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("regionId") regionId: string,
    @Body() input: ManageServiceRegionDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.operations.manageRegion(
      actorFromHeaders(role, id),
      regionId,
      input.action,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { region: result.value };
  }

  @Post("region-neighborhoods/:neighborhoodId/actions")
  async manageRegionNeighborhood(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("neighborhoodId") neighborhoodId: string,
    @Body() input: ManageServiceRegionDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.operations.manageRegionNeighborhood(
      actorFromHeaders(role, id),
      neighborhoodId,
      input.action,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { neighborhood: result.value };
  }

  @Post("categories/:categoryId/actions")
  async manageCategory(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("categoryId") categoryId: string,
    @Body() input: ManageServiceCategoryDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.operations.manageCategory(
      actorFromHeaders(role, id),
      categoryId,
      input.action,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { category: result.value };
  }

  @Get("cases")
  async cases(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return { cases: await this.operations.cases(actorFromHeaders(role, id)) };
  }

  @Get("cases/:caseId")
  async caseDetail(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("caseId") caseId: string,
  ) {
    return { case: await this.operations.caseDetail(actorFromHeaders(role, id), caseId) };
  }

  @Post("cases/:caseId/transitions")
  async changeStatus(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("caseId") caseId: string,
    @Body() input: ChangeSupportCaseStatusDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.operations.changeStatus(
      actorFromHeaders(role, id),
      caseId,
      input.status,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { case: result.value };
  }

  @Post("cases/:caseId/notes")
  async addNote(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("caseId") caseId: string,
    @Body() input: AddSupportCaseNoteDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.operations.addNote(
      actorFromHeaders(role, id),
      caseId,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { event: result.value };
  }

  @Get("referrals")
  async referrals(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return { referrals: await this.operations.referrals(actorFromHeaders(role, id)) };
  }

  @Get("referrals/:referralId")
  async referralDetail(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("referralId") referralId: string,
  ) {
    return { referral: await this.operations.referralDetail(actorFromHeaders(role, id), referralId) };
  }

  @Post("referrals/:referralId/transitions")
  async changeReferralStatus(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("referralId") referralId: string,
    @Body() input: ChangePartnerReferralStatusDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.operations.changeReferralStatus(
      actorFromHeaders(role, id),
      referralId,
      input.status,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { referral: result.value };
  }
}
