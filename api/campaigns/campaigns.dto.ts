import {
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class ValidateCouponDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code!: string;
}

export class CreateCampaignDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/)
  code!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(240)
  description!: string;

  @IsIn(["fixed", "percentage"])
  discountType!: "fixed" | "percentage";

  @IsInt()
  @Min(100)
  @Max(1_000_000)
  discountValue!: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(1_000_000)
  maxDiscountCents?: number;

  @IsInt()
  @Min(100)
  @Max(10_000_000)
  minAmountCents!: number;

  @IsInt()
  @Min(1)
  @Max(100_000)
  totalRedemptionLimit!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  perCustomerLimit!: number;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}

export class ChangeCampaignStatusDto {
  @IsIn(["activate", "pause"])
  action!: "activate" | "pause";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}
