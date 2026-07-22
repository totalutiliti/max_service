import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

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
