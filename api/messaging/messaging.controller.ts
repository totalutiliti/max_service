import { Body, Controller, Get, Headers, Param, Post, Req, Res, StreamableFile, UnauthorizedException } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { parseDemoActor } from "../auth/demo-actor.js";
import { decodeFileName, readLimitedBody, setPrivateFileHeaders, type HeaderResponse } from "../storage/private-file-http.js";
import { maximumPrivateImageBytes } from "../storage/private-image-validation.js";
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

  @Post("conversations/:conversationId/message-attachments")
  async sendAttachment(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("x-file-name") encodedFileName: string | undefined,
    @Headers("x-message-body") encodedBody: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Param("conversationId") conversationId: string,
    @Req() request: IncomingMessage,
  ) {
    const bytes = await readLimitedBody(request, maximumPrivateImageBytes, "A imagem excede o limite de 512 KB.");
    return {
      message: await this.messaging.sendWithAttachment(
        actorFromHeaders(role, id),
        conversationId,
        decodeFileName(encodedBody),
        decodeFileName(encodedFileName),
        contentType ?? "",
        bytes,
      ),
    };
  }

  @Get("message-attachments/:attachmentId")
  async downloadAttachment(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("attachmentId") attachmentId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const file = await this.messaging.downloadAttachment(actorFromHeaders(role, id), attachmentId);
    setPrivateFileHeaders(response, file.originalName, file.contentType, file.bytes.length, "inline");
    return new StreamableFile(file.bytes);
  }
}
