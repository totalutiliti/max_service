import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreatePartnerSupportCaseDto {
  @IsIn(["referral", "account", "finance_sandbox", "other"])
  topic!: "referral" | "account" | "finance_sandbox" | "other";

  @IsString()
  @MinLength(5)
  @MaxLength(120)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsUUID()
  referralId?: string;
}

export class AddPartnerSupportMessageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body!: string;
}

export class ChangePartnerSupportStatusDto {
  @IsIn(["in_review", "resolved"])
  status!: "in_review" | "resolved";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}

export class TriagePartnerSupportCaseDto {
  @IsIn(["normal", "high"])
  priority!: "normal" | "high";

  @IsUUID()
  assigneeId!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}
