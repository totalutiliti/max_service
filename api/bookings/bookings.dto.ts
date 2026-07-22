import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class TransitionBookingDto {
  @IsIn(["in_progress", "completed"])
  status!: "in_progress" | "completed";

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  note?: string;
}

export class ReviewBookingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  comment!: string;
}

export class CancelBookingDto {
  @IsIn(["schedule_change", "no_longer_needed", "participant_unavailable", "safety_concern", "other"])
  reasonCode!: "schedule_change" | "no_longer_needed" | "participant_unavailable" | "safety_concern" | "other";

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  details!: string;
}
