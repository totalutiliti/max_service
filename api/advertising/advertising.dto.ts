import {
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class ContextualAdQueryDto {
  @IsUUID("4")
  categoryId!: string;

  @IsUUID("4")
  regionId!: string;
}

export class TrackContextualAdClickDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  deliveryToken!: string;
}

export class CreateContextualAdCampaignDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(90)
  headline!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(240)
  body!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  ctaLabel!: string;

  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(500)
  destinationUrl!: string;

  @IsOptional()
  @IsUUID("4")
  targetCategoryId?: string;

  @IsOptional()
  @IsUUID("4")
  targetRegionId?: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  impressionLimit!: number;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}

export class ModerateContextualAdDto {
  @IsIn(["approve", "reject", "pause", "activate"])
  action!: "approve" | "reject" | "pause" | "activate";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}
