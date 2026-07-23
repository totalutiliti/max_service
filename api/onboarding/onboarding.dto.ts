import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CompleteOnboardingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  state!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood?: string;

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

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  acceptedDocumentIds!: string[];

  @IsBoolean()
  marketingConsent!: boolean;

  @IsBoolean()
  productResearchConsent!: boolean;
}
