import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { NotificationsService } from "./notifications.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1/notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@Headers("x-demo-role") role: string | undefined, @Headers("x-demo-actor-id") id: string | undefined) {
    return this.notifications.list(actorFromHeaders(role, id));
  }

  @Post(":notificationId/read")
  async markRead(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("notificationId") notificationId: string,
  ) {
    return { notification: await this.notifications.markRead(actorFromHeaders(role, id), notificationId) };
  }

  @Post("read-all")
  async markAllRead(@Headers("x-demo-role") role: string | undefined, @Headers("x-demo-actor-id") id: string | undefined) {
    return this.notifications.markAllRead(actorFromHeaders(role, id));
  }

  @Get("push")
  async pushStatus(@Headers("x-demo-role") role: string | undefined, @Headers("x-demo-actor-id") id: string | undefined) {
    return this.notifications.pushStatus(actorFromHeaders(role, id));
  }

  @Post("push/subscribe")
  async subscribePush(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Body() body: { subscription?: unknown },
  ) {
    return this.notifications.subscribePush(actorFromHeaders(role, id), body.subscription);
  }

  @Post("push/status")
  async pushEndpointStatus(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Body() body: { endpoint?: unknown },
  ) {
    return this.notifications.pushEndpointStatus(actorFromHeaders(role, id), body.endpoint);
  }

  @Post("push/unsubscribe")
  async unsubscribePush(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Body() body: { endpoint?: unknown },
  ) {
    return this.notifications.unsubscribePush(actorFromHeaders(role, id), body.endpoint);
  }
}
