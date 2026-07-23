import { Body, Controller, Get, Headers, Param, Post, Query, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import {
  AddSupportCaseNoteDto,
  ChangePartnerReferralStatusDto,
  ChangeSupportCaseStatusDto,
  ManageServiceCategoryDto,
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
    @Body() input: UpdateOperationReportGoalsDto,
  ) {
    return {
      goals: await this.operations.updateReportGoals(
        actorFromHeaders(role, id),
        input,
      ),
    };
  }

  @Get("categories")
  async categories(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.operations.categories(actorFromHeaders(role, id));
  }

  @Post("categories/:categoryId/actions")
  async manageCategory(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("categoryId") categoryId: string,
    @Body() input: ManageServiceCategoryDto,
  ) {
    return {
      category: await this.operations.manageCategory(
        actorFromHeaders(role, id),
        categoryId,
        input.action,
        input.note,
      ),
    };
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
    @Param("caseId") caseId: string,
    @Body() input: ChangeSupportCaseStatusDto,
  ) {
    return { case: await this.operations.changeStatus(actorFromHeaders(role, id), caseId, input.status, input.note) };
  }

  @Post("cases/:caseId/notes")
  async addNote(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("caseId") caseId: string,
    @Body() input: AddSupportCaseNoteDto,
  ) {
    return { event: await this.operations.addNote(actorFromHeaders(role, id), caseId, input.note) };
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
    @Param("referralId") referralId: string,
    @Body() input: ChangePartnerReferralStatusDto,
  ) {
    return {
      referral: await this.operations.changeReferralStatus(
        actorFromHeaders(role, id),
        referralId,
        input.status,
        input.note,
      ),
    };
  }
}
