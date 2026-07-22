import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { parseDemoActor } from "../auth/demo-actor.js";
import { CancelBookingDto, ReviewBookingDto, TransitionBookingDto } from "./bookings.dto.js";
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
    @Param("bookingId") bookingId: string,
    @Body() input: TransitionBookingDto,
  ) {
    return { booking: await this.bookings.transition(actorFromHeaders(role, id), bookingId, input.status, input.note) };
  }

  @Post("bookings/:bookingId/reviews")
  async review(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("bookingId") bookingId: string,
    @Body() input: ReviewBookingDto,
  ) {
    return { review: await this.bookings.review(actorFromHeaders(role, id), bookingId, input.rating, input.comment) };
  }

  @Post("bookings/:bookingId/cancellations")
  async cancel(
    @Headers("x-demo-role") role: string | undefined,
    @Headers("x-demo-actor-id") id: string | undefined,
    @Param("bookingId") bookingId: string,
    @Body() input: CancelBookingDto,
  ) {
    return this.bookings.cancel(actorFromHeaders(role, id), bookingId, input.reasonCode, input.details);
  }
}
