import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
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
    provider.public_code AS "providerCode"
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

      return { ...booking.rows[0], history: history.rows };
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
}
