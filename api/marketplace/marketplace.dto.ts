import { IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

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

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2)
  state!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  preferredWindow!: string;
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
