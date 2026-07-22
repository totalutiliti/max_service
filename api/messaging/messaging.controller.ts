import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { SendMessageDto } from "./messaging.dto.js";
import { MessagingService } from "./messaging.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1")
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get("conversations")
  async conversations(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return { conversations: await this.messaging.conversations(actorFromHeaders(role, id)) };
  }

  @Get("conversations/:conversationId/messages")
  async messages(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("conversationId") conversationId: string,
  ) {
    return { messages: await this.messaging.messages(actorFromHeaders(role, id), conversationId) };
  }

  @Post("conversations/:conversationId/messages")
  async send(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("conversationId") conversationId: string,
    @Body() input: SendMessageDto,
  ) {
    return { message: await this.messaging.send(actorFromHeaders(role, id), conversationId, input.body) };
  }
}
