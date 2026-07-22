import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class ChangeVerificationStatusDto {
  @IsIn(["in_review", "approved", "changes_requested"])
  status!: "in_review" | "approved" | "changes_requested";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}

export class ReviewProviderDocumentDto {
  @IsIn(["accepted", "changes_requested"])
  status!: "accepted" | "changes_requested";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}
