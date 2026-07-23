import { Equals, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class InviteReferralDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  professionalName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  categorySlug!: string;
}

export class CapturePublicReferralDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  professionalName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(60)
  categorySlug!: string;

  @IsIn(["link", "qr"])
  source!: "link" | "qr";

  @Equals(true)
  consent!: true;

  @IsOptional()
  @IsString()
  @MaxLength(0)
  website?: string;
}
