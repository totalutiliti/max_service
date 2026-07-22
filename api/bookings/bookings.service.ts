import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";

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
`;

@Injectable()
export class BookingsService {
  constructor(private readonly database: DatabaseService) {}

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

  async transition(actor: Actor, bookingId: string, status: "in_progress" | "completed", note?: string) {
    if (actor.role !== "provider") throw new ForbiddenException("Somente o profissional responsável pode atualizar o serviço.");
    const rule = transitionRules[status];

    return this.database.withActor(actor, async (client) => {
      const current = await client.query<{ id: string; requestId: string; status: BookingStatus }>(`
        SELECT id, request_id AS "requestId", status
        FROM bookings
        WHERE id = $1 AND provider_id = $2
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
      const historyNote = note?.trim() || rule.note;
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

      return updated.rows[0];
    });
  }

  async review(actor: Actor, bookingId: string, rating: number, comment: string) {
    if (actor.role !== "customer" && actor.role !== "provider") {
      throw new ForbiddenException("Este perfil não pode avaliar o serviço.");
    }
    const normalizedComment = comment.trim();
    if (normalizedComment.length < 10) throw new BadRequestException("O comentário deve ter pelo menos 10 caracteres.");

    return this.database.withActor(actor, async (client) => {
      const booking = await client.query<{ id: string; status: BookingStatus; customerId: string; providerId: string }>(`
        SELECT id, status, customer_id AS "customerId", provider_id AS "providerId"
        FROM bookings
        WHERE id = $1
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
      return result.rows[0];
    });
  }
}
