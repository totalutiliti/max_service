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
