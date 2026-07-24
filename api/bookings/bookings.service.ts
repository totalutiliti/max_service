import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import { createNotification } from "../notifications/notification-writer.js";
import type { CreateProviderScheduleBlockDto, UpdateProviderWeeklyScheduleDto } from "./bookings.dto.js";

type BookingStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

const transitionRules: Record<"in_progress" | "completed", { from: BookingStatus; note: string }> = {
  in_progress: { from: "scheduled", note: "Serviço iniciado pelo profissional." },
  completed: { from: "in_progress", note: "Serviço concluído pelo profissional." },
};

const bookingSelect = `
  SELECT
    b.id,
    b.status,
    b.scheduled_for AS "scheduledFor",
    b.scheduled_until AS "scheduledUntil",
    b.started_at AS "startedAt",
    b.completed_at AS "completedAt",
    b.created_at AS "createdAt",
    r.id AS "requestId",
    r.public_code AS "requestCode",
    r.title AS "requestTitle",
    r.description AS "requestDescription",
    r.neighborhood,
    r.city,
    r.state,
    sc.name AS "categoryName",
    sc.icon AS "categoryIcon",
    p.amount_cents AS "amountCents",
    p.estimated_minutes AS "estimatedMinutes",
    customer.id AS "customerId",
    customer.display_name AS "customerName",
    customer.public_code AS "customerCode",
    provider.id AS "providerId",
    provider.display_name AS "providerName",
    provider.public_code AS "providerCode",
    cancellation.reason_code AS "cancellationReason",
    cancellation.details AS "cancellationDetails",
    cancellation.prior_status AS "cancellationPriorStatus",
    cancellation.created_at AS "cancelledAt",
    canceller.display_name AS "cancelledByName",
    support.public_code AS "supportCaseCode",
    support.status AS "supportCaseStatus",
    (SELECT COUNT(*)::integer FROM service_reviews sr WHERE sr.booking_id = b.id) AS "reviewCount",
    (SELECT ROUND(AVG(sr.rating), 1) FROM service_reviews sr WHERE sr.booking_id = b.id) AS "averageRating",
    EXISTS (
      SELECT 1 FROM service_reviews sr
      WHERE sr.booking_id = b.id
        AND sr.author_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    ) AS "hasActorReview"
  FROM bookings b
  JOIN service_requests r ON r.id = b.request_id
  JOIN service_categories sc ON sc.id = r.category_id
  JOIN proposals p ON p.id = b.proposal_id
  JOIN users customer ON customer.id = b.customer_id
  JOIN users provider ON provider.id = b.provider_id
  LEFT JOIN booking_cancellations cancellation ON cancellation.booking_id = b.id
  LEFT JOIN users canceller ON canceller.id = cancellation.requested_by
  LEFT JOIN support_cases support ON support.booking_id = b.id
`;

@Injectable()
export class BookingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(actor: Actor) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`${bookingSelect}
        ORDER BY
          CASE b.status WHEN 'in_progress' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
          b.scheduled_for DESC,
          b.created_at DESC
      `);
      return result.rows;
    });
  }

  async providerSchedule(actor: Actor) {
    if (actor.role !== "provider") {
      throw new ForbiddenException("Somente profissionais podem consultar a própria agenda.");
    }
    return this.database.withActor(
      actor,
      (client) => this.providerScheduleWithinTransaction(client, actor.id),
    );
  }

  async updateWeeklySchedule(
    actor: Actor,
    input: UpdateProviderWeeklyScheduleDto,
    idempotencyKey: string | undefined,
  ) {
    if (actor.role !== "provider") {
      throw new ForbiddenException("Somente profissionais podem alterar a própria agenda.");
    }
    const days = new Set(input.weekly.map((day) => day.dayOfWeek));
    if (days.size !== 7 || ![1, 2, 3, 4, 5, 6, 7].every((day) => days.has(day))) {
      throw new BadRequestException("Informe os sete dias da semana uma única vez.");
    }
    if (!input.weekly.some((day) => day.active)) {
      throw new BadRequestException("Mantenha ao menos um dia disponível.");
    }
    for (const day of input.weekly) {
      const start = clockMinutes(day.startTime);
      const end = clockMinutes(day.endTime);
      if (start % 30 !== 0 || end % 30 !== 0 || end - start < 60) {
        throw new BadRequestException("Dias ativos ou pausados devem usar intervalos de 30 minutos e ao menos uma hora.");
      }
    }
    const normalized = [...input.weekly].sort((left, right) => left.dayOfWeek - right.dayOfWeek);

    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: "/api/v1/provider/schedule/weekly",
        payload: { weekly: normalized },
      }, async () => {
      const settings = await client.query<{ version: number }>(`
        SELECT version
        FROM provider_schedule_settings
        WHERE provider_id = $1
        FOR UPDATE
      `, [actor.id]);
      if (!settings.rows[0]) throw new NotFoundException("Agenda profissional não configurada.");
      const current = await client.query<{
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        active: boolean;
      }>(`
        SELECT
          day_of_week AS "dayOfWeek",
          to_char(start_time, 'HH24:MI') AS "startTime",
          to_char(end_time, 'HH24:MI') AS "endTime",
          active
        FROM provider_weekly_availability
        WHERE provider_id = $1
        ORDER BY day_of_week
      `, [actor.id]);
      const changed = JSON.stringify(current.rows) !== JSON.stringify(normalized);
      if (!changed) return this.providerScheduleWithinTransaction(client, actor.id);

      for (const day of normalized) {
        await client.query(`
          INSERT INTO provider_weekly_availability (
            provider_id, day_of_week, start_time, end_time, active
          ) VALUES ($1, $2, $3::time, $4::time, $5)
          ON CONFLICT (provider_id, day_of_week) DO UPDATE SET
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            active = EXCLUDED.active,
            updated_at = now()
        `, [actor.id, day.dayOfWeek, day.startTime, day.endTime, day.active]);
      }
      const version = settings.rows[0].version + 1;
      const eventId = randomUUID();
      await client.query(
        "UPDATE provider_schedule_settings SET version = $2, updated_at = now() WHERE provider_id = $1",
        [actor.id, version],
      );
      await client.query(`
        INSERT INTO provider_schedule_events (
          id, provider_id, actor_id, event_type, schedule_version, snapshot
        ) VALUES ($1, $2, $2, 'weekly_updated', $3, $4::jsonb)
      `, [eventId, actor.id, version, JSON.stringify({ weekly: normalized })]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'provider_schedule.weekly_updated', 'provider_schedule', $3, $4::jsonb)",
        [actor.id, actor.role, actor.id, JSON.stringify({ version, eventId, openDayCount: normalized.filter((day) => day.active).length })],
      );
      return this.providerScheduleWithinTransaction(client, actor.id);
      });
    });
  }

  async createScheduleBlock(
    actor: Actor,
    input: CreateProviderScheduleBlockDto,
    idempotencyKey: string | undefined,
  ) {
    if (actor.role !== "provider") {
      throw new ForbiddenException("Somente profissionais podem bloquear a própria agenda.");
    }
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const reason = input.reason.trim();
    if (startsAt.getTime() < Date.now() + 30 * 60_000) {
      throw new BadRequestException("O bloqueio deve começar com pelo menos 30 minutos de antecedência.");
    }
    if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 14 * 86_400_000) {
      throw new BadRequestException("O bloqueio deve terminar depois do início e durar no máximo 14 dias.");
    }
    if (startsAt.getTime() > Date.now() + 180 * 86_400_000) {
      throw new BadRequestException("Crie bloqueios dentro dos próximos 180 dias.");
    }

    try {
      return await this.database.withActor(actor, async (client) => {
        return this.idempotency.execute(client, actor, {
          key: idempotencyKey,
          method: "POST",
          route: "/api/v1/provider/schedule/blocks",
          payload: {
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            reason,
          },
        }, async () => {
        const settings = await client.query<{ version: number }>(`
          SELECT version
          FROM provider_schedule_settings
          WHERE provider_id = $1
          FOR UPDATE
        `, [actor.id]);
        if (!settings.rows[0]) throw new NotFoundException("Agenda profissional não configurada.");
        const blockId = randomUUID();
        const block = await client.query(`
          INSERT INTO provider_schedule_blocks (
            id, provider_id, starts_at, ends_at, reason
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING
            id,
            starts_at AS "startsAt",
            ends_at AS "endsAt",
            reason,
            status,
            created_at AS "createdAt"
        `, [blockId, actor.id, startsAt, endsAt, reason]);
        const version = settings.rows[0].version + 1;
        const eventId = randomUUID();
        await client.query(
          "UPDATE provider_schedule_settings SET version = $2, updated_at = now() WHERE provider_id = $1",
          [actor.id, version],
        );
        await client.query(`
          INSERT INTO provider_schedule_events (
            id, provider_id, actor_id, event_type, schedule_version, snapshot
          ) VALUES ($1, $2, $2, 'block_created', $3, $4::jsonb)
        `, [eventId, actor.id, version, JSON.stringify({ blockId, startsAt, endsAt, reason })]);
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'provider_schedule.block_created', 'provider_schedule_block', $3, $4::jsonb)",
          [actor.id, actor.role, blockId, JSON.stringify({ version, eventId, startsAt, endsAt })],
        );
        return { block: block.rows[0], version };
        });
      });
    } catch (error) {
      throwScheduleConflict(error);
    }
  }

  async cancelScheduleBlock(
    actor: Actor,
    blockId: string,
    idempotencyKey: string | undefined,
  ) {
    if (actor.role !== "provider") {
      throw new ForbiddenException("Somente profissionais podem liberar a própria agenda.");
    }
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/provider/schedule/blocks/${blockId}/cancel`,
        payload: {},
      }, async () => {
      const settings = await client.query<{ version: number }>(`
        SELECT version
        FROM provider_schedule_settings
        WHERE provider_id = $1
        FOR UPDATE
      `, [actor.id]);
      if (!settings.rows[0]) throw new NotFoundException("Agenda profissional não configurada.");
      const block = await client.query<{
        id: string;
        startsAt: Date;
        endsAt: Date;
      }>(`
        UPDATE provider_schedule_blocks
        SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE id = $1
          AND provider_id = $2
          AND status = 'active'
        RETURNING id, starts_at AS "startsAt", ends_at AS "endsAt"
      `, [blockId, actor.id]);
      if (!block.rows[0]) throw new NotFoundException("Bloqueio ativo não encontrado.");
      const version = settings.rows[0].version + 1;
      const eventId = randomUUID();
      await client.query(
        "UPDATE provider_schedule_settings SET version = $2, updated_at = now() WHERE provider_id = $1",
        [actor.id, version],
      );
      await client.query(`
        INSERT INTO provider_schedule_events (
          id, provider_id, actor_id, event_type, schedule_version, snapshot
        ) VALUES ($1, $2, $2, 'block_cancelled', $3, $4::jsonb)
      `, [eventId, actor.id, version, JSON.stringify({ blockId, ...block.rows[0] })]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'provider_schedule.block_cancelled', 'provider_schedule_block', $3, $4::jsonb)",
        [actor.id, actor.role, blockId, JSON.stringify({ version, eventId })],
      );
      return { blockId, status: "cancelled", version };
      });
    });
  }

  private async providerScheduleWithinTransaction(client: PoolClient, providerId: string) {
    const settings = await client.query<{
      providerId: string;
      timeZone: string;
      version: number;
      updatedAt: Date;
    }>(`
      SELECT
        provider_id AS "providerId",
        time_zone AS "timeZone",
        version,
        updated_at AS "updatedAt"
      FROM provider_schedule_settings
      WHERE provider_id = $1
    `, [providerId]);
    if (!settings.rows[0]) throw new NotFoundException("Agenda profissional não configurada.");
    const weekly = await client.query<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      active: boolean;
    }>(`
      SELECT
        day_of_week AS "dayOfWeek",
        to_char(start_time, 'HH24:MI') AS "startTime",
        to_char(end_time, 'HH24:MI') AS "endTime",
        active
      FROM provider_weekly_availability
      WHERE provider_id = $1
      ORDER BY day_of_week
    `, [providerId]);
    const blocks = await client.query<{
      id: string;
      startsAt: Date;
      endsAt: Date;
      reason: string;
      status: "active" | "cancelled";
      createdAt: Date;
    }>(`
      SELECT
        id,
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        reason,
        status,
        created_at AS "createdAt"
      FROM provider_schedule_blocks
      WHERE provider_id = $1
        AND ends_at >= now() - interval '7 days'
      ORDER BY starts_at, id
      LIMIT 40
    `, [providerId]);
    const appointments = await client.query<{
      id: string;
      requestCode: string;
      requestTitle: string;
      customerName: string;
      status: BookingStatus;
      scheduledFor: Date;
      scheduledUntil: Date;
    }>(`
      SELECT
        booking.id,
        request.public_code AS "requestCode",
        request.title AS "requestTitle",
        customer.display_name AS "customerName",
        booking.status,
        booking.scheduled_for AS "scheduledFor",
        booking.scheduled_until AS "scheduledUntil"
      FROM bookings booking
      JOIN service_requests request ON request.id = booking.request_id
      JOIN users customer ON customer.id = booking.customer_id
      WHERE booking.provider_id = $1
        AND booking.status IN ('scheduled', 'in_progress')
        AND booking.scheduled_until >= now()
      ORDER BY booking.scheduled_for, booking.id
      LIMIT 40
    `, [providerId]);
    const history = await client.query<{
      id: string;
      eventType: "weekly_updated" | "block_created" | "block_cancelled";
      scheduleVersion: number;
      createdAt: Date;
    }>(`
      SELECT
        id,
        event_type AS "eventType",
        schedule_version AS "scheduleVersion",
        created_at AS "createdAt"
      FROM provider_schedule_events
      WHERE provider_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 10
    `, [providerId]);
    return {
      settings: settings.rows[0],
      weekly: weekly.rows,
      blocks: blocks.rows,
      appointments: appointments.rows,
      history: history.rows,
      metrics: {
        openDayCount: weekly.rows.filter((day) => day.active).length,
        activeBlockCount: blocks.rows.filter((block) => block.status === "active" && block.endsAt.getTime() >= Date.now()).length,
        upcomingAppointmentCount: appointments.rows.length,
      },
    };
  }

  async detail(actor: Actor, bookingId: string) {
    return this.database.withActor(actor, async (client) => {
      const booking = await client.query(`${bookingSelect} WHERE b.id = $1`, [bookingId]);
      if (!booking.rows[0]) throw new NotFoundException("Agendamento não encontrado.");

      const history = await client.query(`
        SELECT
          h.id,
          h.status,
          h.note,
          h.created_at AS "createdAt",
          u.display_name AS "actorName",
          u.role AS "actorRole"
        FROM booking_status_history h
        JOIN users u ON u.id = h.actor_id
        WHERE h.booking_id = $1
        ORDER BY h.created_at, h.id
      `, [bookingId]);

      const reviews = await client.query(`
        SELECT
          sr.id,
          sr.rating,
          sr.comment,
          sr.author_role AS "authorRole",
          sr.created_at AS "createdAt",
          author.display_name AS "authorName",
          subject.display_name AS "subjectName"
        FROM service_reviews sr
        JOIN users author ON author.id = sr.author_id
        JOIN users subject ON subject.id = sr.subject_id
        WHERE sr.booking_id = $1
        ORDER BY sr.created_at, sr.id
      `, [bookingId]);

      return { ...booking.rows[0], history: history.rows, reviews: reviews.rows };
    });
  }

  async transition(
    actor: Actor,
    bookingId: string,
    status: "in_progress" | "completed",
    note: string | undefined,
    idempotencyKey: string | undefined,
  ) {
    if (actor.role !== "provider") throw new ForbiddenException("Somente o profissional responsável pode atualizar o serviço.");
    const rule = transitionRules[status];
    const historyNote = note?.trim() || rule.note;

    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/bookings/${bookingId}/transitions`,
        payload: { status, note: historyNote },
      }, async () => {
      const current = await client.query<{ id: string; requestId: string; status: BookingStatus; customerId: string; requestCode: string }>(`
        SELECT b.id, b.request_id AS "requestId", b.status, b.customer_id AS "customerId", r.public_code AS "requestCode"
        FROM bookings b
        JOIN service_requests r ON r.id = b.request_id
        WHERE b.id = $1 AND b.provider_id = $2
      `, [bookingId, actor.id]);
      if (!current.rows[0]) throw new NotFoundException("Agendamento não encontrado.");
      if (current.rows[0].status !== rule.from) {
        throw new ConflictException(`Transição inválida: o serviço está como ${current.rows[0].status}.`);
      }

      const updated = await client.query(`
        UPDATE bookings
        SET
          status = $2,
          started_at = CASE WHEN $2 = 'in_progress' THEN now() ELSE started_at END,
          completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END,
          updated_at = now()
        WHERE id = $1 AND status = $3
        RETURNING id, status, scheduled_for AS "scheduledFor", started_at AS "startedAt", completed_at AS "completedAt"
      `, [bookingId, status, rule.from]);
      if (!updated.rows[0]) throw new ConflictException("O serviço foi atualizado por outra ação. Recarregue e tente novamente.");

      await client.query(
        "UPDATE service_requests SET status = $2, updated_at = now() WHERE id = $1",
        [current.rows[0].requestId, status],
      );
      await client.query(
        "INSERT INTO booking_status_history (booking_id, status, actor_id, note) VALUES ($1, $2, $3, $4)",
        [bookingId, status, actor.id, historyNote],
      );
      await client.query(
        "INSERT INTO request_status_history (request_id, status, actor_id, note) VALUES ($1, $2, $3, $4)",
        [current.rows[0].requestId, status, actor.id, historyNote],
      );
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'booking.status_changed', 'booking', $3, $4::jsonb)",
        [actor.id, actor.role, bookingId, JSON.stringify({ from: rule.from, to: status, requestId: current.rows[0].requestId })],
      );
      await createNotification(client, {
        userId: current.rows[0].customerId,
        actorId: actor.id,
        type: status === "in_progress" ? "booking_started" : "booking_completed",
        title: status === "in_progress" ? `Serviço iniciado · ${current.rows[0].requestCode}` : `Serviço concluído · ${current.rows[0].requestCode}`,
        body: status === "in_progress" ? "O profissional informou que o atendimento começou." : "O profissional concluiu o atendimento. Sua avaliação já está disponível.",
        entityType: "booking",
        entityId: bookingId,
      });

      return updated.rows[0];
      });
    });
  }

  async review(
    actor: Actor,
    bookingId: string,
    rating: number,
    comment: string,
    idempotencyKey: string | undefined,
  ) {
    if (actor.role !== "customer" && actor.role !== "provider") {
      throw new ForbiddenException("Este perfil não pode avaliar o serviço.");
    }
    const normalizedComment = comment.trim();
    if (normalizedComment.length < 10) throw new BadRequestException("O comentário deve ter pelo menos 10 caracteres.");

    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/bookings/${bookingId}/reviews`,
        payload: { rating, comment: normalizedComment },
      }, async () => {
      const booking = await client.query<{ id: string; status: BookingStatus; customerId: string; providerId: string; requestCode: string }>(`
        SELECT b.id, b.status, b.customer_id AS "customerId", b.provider_id AS "providerId", r.public_code AS "requestCode"
        FROM bookings b
        JOIN service_requests r ON r.id = b.request_id
        WHERE b.id = $1
      `, [bookingId]);
      if (!booking.rows[0]) throw new NotFoundException("Agendamento não encontrado.");
      if (booking.rows[0].status !== "completed") {
        throw new ConflictException("A avaliação será liberada após a conclusão do serviço.");
      }

      const existing = await client.query("SELECT id FROM service_reviews WHERE booking_id = $1 AND author_id = $2", [bookingId, actor.id]);
      if (existing.rows[0]) throw new ConflictException("Você já avaliou este serviço.");

      const subjectId = actor.role === "customer" ? booking.rows[0].providerId : booking.rows[0].customerId;
      const reviewId = randomUUID();
      const result = await client.query(`
        INSERT INTO service_reviews (id, booking_id, author_id, subject_id, author_role, rating, comment)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (booking_id, author_id) DO NOTHING
        RETURNING id, booking_id AS "bookingId", rating, comment, author_role AS "authorRole", created_at AS "createdAt"
      `, [reviewId, bookingId, actor.id, subjectId, actor.role, rating, normalizedComment]);
      if (!result.rows[0]) throw new ConflictException("Você já avaliou este serviço.");
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'service_review.created', 'service_review', $3, $4::jsonb)",
        [actor.id, actor.role, reviewId, JSON.stringify({ bookingId, subjectId, rating })],
      );
      await createNotification(client, {
        userId: subjectId,
        actorId: actor.id,
        type: "review_received",
        title: `Nova avaliação · ${booking.rows[0].requestCode}`,
        body: `Você recebeu uma avaliação de ${rating} estrela${rating === 1 ? "" : "s"}.`,
        entityType: "service_review",
        entityId: reviewId,
      });
      return result.rows[0];
      });
    });
  }

  async cancel(
    actor: Actor,
    bookingId: string,
    reasonCode: "schedule_change" | "no_longer_needed" | "participant_unavailable" | "safety_concern" | "other",
    details: string,
    idempotencyKey: string | undefined,
  ) {
    if (actor.role !== "customer" && actor.role !== "provider") {
      throw new ForbiddenException("Este perfil não pode cancelar o serviço.");
    }
    const normalizedDetails = details.trim();
    if (normalizedDetails.length < 10) throw new BadRequestException("Descreva o motivo com pelo menos 10 caracteres.");

    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/bookings/${bookingId}/cancellations`,
        payload: { reasonCode, details: normalizedDetails },
      }, async () => {
      const current = await client.query<{ id: string; requestId: string; requestCode: string; status: BookingStatus; customerId: string; providerId: string }>(`
        SELECT b.id, b.request_id AS "requestId", r.public_code AS "requestCode", b.status,
          b.customer_id AS "customerId", b.provider_id AS "providerId"
        FROM bookings b
        JOIN service_requests r ON r.id = b.request_id
        WHERE b.id = $1
      `, [bookingId]);
      if (!current.rows[0]) throw new NotFoundException("Agendamento não encontrado.");
      if (current.rows[0].status !== "scheduled" && current.rows[0].status !== "in_progress") {
        throw new ConflictException("Este serviço não pode mais ser cancelado.");
      }

      const cancellationId = randomUUID();
      const cancellation = await client.query(`
        INSERT INTO booking_cancellations (id, booking_id, requested_by, actor_role, reason_code, details, prior_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (booking_id) DO NOTHING
        RETURNING id, reason_code AS "reasonCode", details, prior_status AS "priorStatus", created_at AS "createdAt"
      `, [cancellationId, bookingId, actor.id, actor.role, reasonCode, normalizedDetails, current.rows[0].status]);
      if (!cancellation.rows[0]) throw new ConflictException("O cancelamento deste serviço já foi registrado.");

      const updated = await client.query(`
        UPDATE bookings
        SET status = 'cancelled', updated_at = now()
        WHERE id = $1 AND status = $2
        RETURNING id, status
      `, [bookingId, current.rows[0].status]);
      if (!updated.rows[0]) throw new ConflictException("O serviço foi atualizado por outra ação. Recarregue e tente novamente.");

      await client.query("UPDATE service_requests SET status = 'cancelled', updated_at = now() WHERE id = $1", [current.rows[0].requestId]);
      const historyNote = `Cancelamento solicitado: ${normalizedDetails}`;
      await client.query(
        "INSERT INTO booking_status_history (booking_id, status, actor_id, note) VALUES ($1, 'cancelled', $2, $3)",
        [bookingId, actor.id, historyNote],
      );
      await client.query(
        "INSERT INTO request_status_history (request_id, status, actor_id, note) VALUES ($1, 'cancelled', $2, $3)",
        [current.rows[0].requestId, actor.id, historyNote],
      );

      const caseId = randomUUID();
      const caseCode = `CS-${randomUUID().slice(0, 6).toUpperCase()}`;
      const supportCase = await client.query(`
        INSERT INTO support_cases (id, public_code, booking_id, opened_by, case_type, priority, status, title, description)
        VALUES ($1, $2, $3, $4, 'cancellation', $5, 'open', $6, $7)
        RETURNING id, public_code AS "publicCode", priority, status, created_at AS "createdAt"
      `, [caseId, caseCode, bookingId, actor.id, current.rows[0].status === "in_progress" ? "high" : "normal", `Cancelamento do serviço ${current.rows[0].requestCode}`, normalizedDetails]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'booking.cancelled', 'booking', $3, $4::jsonb)",
        [actor.id, actor.role, bookingId, JSON.stringify({ from: current.rows[0].status, reasonCode, caseId })],
      );
      const otherParticipantId = actor.role === "customer" ? current.rows[0].providerId : current.rows[0].customerId;
      await createNotification(client, {
        userId: otherParticipantId,
        actorId: actor.id,
        type: "booking_cancelled",
        title: `Serviço cancelado · ${current.rows[0].requestCode}`,
        body: normalizedDetails,
        entityType: "booking",
        entityId: bookingId,
      });
      await createNotification(client, {
        userId: "00000000-0000-4000-8000-000000000401",
        actorId: actor.id,
        type: "case_opened",
        title: `Novo chamado · ${caseCode}`,
        body: `${current.rows[0].requestCode}: ${normalizedDetails}`,
        entityType: "support_case",
        entityId: caseId,
      });

      return { cancellation: cancellation.rows[0], case: supportCase.rows[0] };
      });
    });
  }
}

function clockMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function throwScheduleConflict(error: unknown): never {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error.code === "23514" || error.code === "23P01")
  ) {
    const message = "message" in error && typeof error.message === "string"
      ? error.message
      : "Esse período não está disponível na agenda.";
    throw new ConflictException(message);
  }
  throw error;
}
