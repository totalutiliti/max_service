import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class TransitionBookingDto {
  @IsIn(["in_progress", "completed"])
  status!: "in_progress" | "completed";

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  note?: string;
}
