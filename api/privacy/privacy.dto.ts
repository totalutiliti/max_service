import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateDataSubjectRequestDto {
  @IsIn(["access", "correction", "deletion", "restriction", "consent_withdrawal"])
  requestType!: "access" | "correction" | "deletion" | "restriction" | "consent_withdrawal";

  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  description!: string;

  @IsBoolean()
  @Equals(true)
  acknowledgement!: true;
}

export class TransitionDataSubjectRequestDto {
  @IsIn(["in_review", "awaiting_subject", "fulfilled", "denied"])
  status!: "in_review" | "awaiting_subject" | "fulfilled" | "denied";

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  note!: string;
}
