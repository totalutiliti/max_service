import { Body, Controller, Get, Headers, Param, Post, Res, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import type { HeaderResponse } from "../storage/private-file-http.js";
import {
  CancelBookingDto,
  CreateProviderScheduleBlockDto,
  ReviewBookingDto,
  TransitionBookingDto,
  UpdateProviderWeeklyScheduleDto,
} from "./bookings.dto.js";
import { BookingsService } from "./bookings.service.js";

function actorFromHeaders(role: string | undefined, id: string | undefined) {
  try {
    return parseDemoActor(role, id);
  } catch (error) {
    throw new UnauthorizedException(error instanceof Error ? error.message : "Acesso inválido.");
  }
}

@Controller("api/v1")
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get("provider/schedule")
  async providerSchedule(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return this.bookings.providerSchedule(actorFromHeaders(role, id));
  }

  @Post("provider/schedule/weekly")
  async updateProviderWeeklySchedule(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: UpdateProviderWeeklyScheduleDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.bookings.updateWeeklySchedule(
      actorFromHeaders(role, id),
      input,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return result.value;
  }

  @Post("provider/schedule/blocks")
  async createProviderScheduleBlock(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateProviderScheduleBlockDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.bookings.createScheduleBlock(
      actorFromHeaders(role, id),
      input,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return result.value;
  }

  @Post("provider/schedule/blocks/:blockId/cancel")
  async cancelProviderScheduleBlock(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("blockId") blockId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.bookings.cancelScheduleBlock(
      actorFromHeaders(role, id),
      blockId,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return result.value;
  }

  @Get("bookings")
  async list(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
  ) {
    return { bookings: await this.bookings.list(actorFromHeaders(role, id)) };
  }

  @Get("bookings/:bookingId")
  async detail(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("bookingId") bookingId: string,
  ) {
    return { booking: await this.bookings.detail(actorFromHeaders(role, id), bookingId) };
  }

  @Post("bookings/:bookingId/transitions")
  async transition(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("bookingId") bookingId: string,
    @Body() input: TransitionBookingDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.bookings.transition(
      actorFromHeaders(role, id),
      bookingId,
      input.status,
      input.note,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { booking: result.value };
  }

  @Post("bookings/:bookingId/reviews")
  async review(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("bookingId") bookingId: string,
    @Body() input: ReviewBookingDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.bookings.review(
      actorFromHeaders(role, id),
      bookingId,
      input.rating,
      input.comment,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return { review: result.value };
  }

  @Post("bookings/:bookingId/cancellations")
  async cancel(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("bookingId") bookingId: string,
    @Body() input: CancelBookingDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.bookings.cancel(
      actorFromHeaders(role, id),
      bookingId,
      input.reasonCode,
      input.details,
      idempotencyKey,
    );
    response.setHeader("idempotency-replayed", String(result.replayed));
    return result.value;
  }
}
