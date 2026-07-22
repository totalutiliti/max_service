import { IsIn } from "class-validator";
import type { ActorRole } from "./demo-actor.js";

export class CreateDemoSessionDto {
  @IsIn(["customer", "provider", "partner", "operation"])
  role!: ActorRole;
}
