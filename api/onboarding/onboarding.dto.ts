import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CompleteOnboardingDto {
  @IsOptional()
  @IsUUID("4")
  regionId?: string;

  @IsOptional()
  @IsUUID("4")
  neighborhoodId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUUID("4", { each: true })
  serviceRegionIds?: string[];

  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  yearsExperience?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  serviceRadiusKm?: number;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  availabilitySummary?: string;

  @IsOptional()
  @IsIn(["available_now", "scheduled", "paused"])
  availabilityStatus?: "available_now" | "scheduled" | "paused";

  @IsOptional()
  @IsBoolean()
  acceptsUrgent?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  activeProposalLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  activeJobLimit?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  acceptedDocumentIds!: string[];

  @IsBoolean()
  marketingConsent!: boolean;

  @IsBoolean()
  productResearchConsent!: boolean;
}
