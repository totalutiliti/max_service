import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class MarkConversationReadDto {
  @IsUUID()
  messageId!: string;
}
