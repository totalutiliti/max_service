import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

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

export class ReviewPartnerReferralRiskDto {
  @IsIn(["cleared", "confirmed"])
  outcome!: "cleared" | "confirmed";

  @IsString()
  @MinLength(20)
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

export class ManageServiceRegionDto {
  @IsIn(["activate", "deactivate"])
  action!: "activate" | "deactivate";

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

export class CreateOperationReportDeliveryScheduleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  label!: string;

  @IsIn([7, 30, 90])
  periodDays!: 7 | 30 | 90;

  @IsIn(["weekly", "monthly"])
  cadence!: "weekly" | "monthly";

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  recipientName!: string;

  @IsEmail()
  @MaxLength(254)
  recipientEmail!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(300)
  purpose!: string;

  @IsISO8601({ strict: true })
  nextRunAt!: string;

  @IsBoolean()
  @Equals(true)
  consentConfirmed!: true;
}

export class ChangeOperationReportDeliveryScheduleStatusDto {
  @IsIn(["active", "paused"])
  status!: "active" | "paused";

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}

export class SimulateOperationReportDeliveryDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class UpdateOperationReadinessGateDto {
  @IsIn(["blocked", "in_progress", "evidence_ready"])
  status!: "blocked" | "in_progress" | "evidence_ready";

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  ownerLabel!: string;

  @IsString()
  @MaxLength(1000)
  evidence!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}
