import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateNested,
} from "class-validator";

export class WeeklyAvailabilityDto {
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsBoolean()
  active!: boolean;
}

export class UpdateProviderWeeklyScheduleDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeeklyAvailabilityDto)
  weekly!: WeeklyAvailabilityDto[];
}

export class CreateProviderScheduleBlockDto {
  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsISO8601({ strict: true })
  endsAt!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(160)
  reason!: string;
}

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
