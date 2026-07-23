import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class ChangeSupportCaseStatusDto {
  @IsIn(["in_review", "resolved"])
  status!: "in_review" | "resolved";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}

export class AddSupportCaseNoteDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}

export class ChangePartnerReferralStatusDto {
  @IsIn(["in_review", "approved", "rejected"])
  status!: "in_review" | "approved" | "rejected";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}

export class ManageServiceCategoryDto {
  @IsIn(["activate", "deactivate", "move_up", "move_down"])
  action!: "activate" | "deactivate" | "move_up" | "move_down";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}

export class UpdateOperationReportGoalsDto {
  @IsIn([7, 30, 90])
  periodDays!: 7 | 30 | 90;

  @IsInt()
  @Min(0)
  @Max(10000)
  proposalCoverageTargetBps!: number;

  @IsInt()
  @Min(0)
  @Max(10000)
  bookingConversionTargetBps!: number;

  @IsInt()
  @Min(1)
  @Max(10080)
  firstProposalTargetMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(10000)
  overdueCaseLimit!: number;

  @IsInt()
  @Min(0)
  @Max(10000)
  unreconciledLimit!: number;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}
