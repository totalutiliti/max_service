import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

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
