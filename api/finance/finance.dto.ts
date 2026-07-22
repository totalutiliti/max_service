import { IsIn, IsInt, IsUUID, Min } from "class-validator";

export class SandboxFinancialEventDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  intentId!: string;

  @IsIn(["settlement", "refund"])
  eventType!: "settlement" | "refund";

  @IsInt()
  @Min(1)
  amountCents!: number;
}
