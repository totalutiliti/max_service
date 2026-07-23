import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateServiceRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  categorySlug!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  description!: string;

  @IsUUID("4")
  regionId!: string;

  @IsUUID("4")
  neighborhoodId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  preferredWindow!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  couponCode?: string;
}

export class CreateProposalDto {
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  amountCents!: number;

  @IsInt()
  @Min(15)
  @Max(10_080)
  estimatedMinutes!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  message!: string;
}

export class UpdateProviderMatchingDto {
  @IsIn(["available_now", "scheduled", "paused"])
  availabilityStatus!: "available_now" | "scheduled" | "paused";

  @IsBoolean()
  acceptsUrgent!: boolean;

  @IsInt()
  @Min(1)
  @Max(20)
  activeProposalLimit!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  activeJobLimit!: number;
}
