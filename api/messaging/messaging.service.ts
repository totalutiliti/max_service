import { randomUUID } from "node:crypto";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { createNotification } from "../notifications/notification-writer.js";

@Injectable()
export class MessagingService {
  constructor(private readonly database: DatabaseService) {}

  async conversations(actor: Actor) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`
        SELECT
          c.id,
          b.id AS "bookingId",
          b.status AS "bookingStatus",
          b.scheduled_for AS "scheduledFor",
          r.public_code AS "requestCode",
          r.title AS "requestTitle",
          other.id AS "otherUserId",
          other.display_name AS "otherName",
          other.public_code AS "otherCode",
          latest.body AS "latestMessage",
          latest.created_at AS "latestMessageAt"
        FROM conversations c
        JOIN bookings b ON b.id = c.booking_id
        JOIN service_requests r ON r.id = b.request_id
        JOIN users other ON other.id = CASE WHEN b.customer_id = $1 THEN b.provider_id ELSE b.customer_id END
        LEFT JOIN LATERAL (
          SELECT m.body, m.created_at
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) latest ON true
        ORDER BY COALESCE(latest.created_at, c.created_at) DESC
      `, [actor.id]);
      return result.rows;
    });
  }

  async messages(actor: Actor, conversationId: string) {
    return this.database.withActor(actor, async (client) => {
      const conversation = await client.query<{ id: string; otherUserId: string; requestCode: string }>(`
        SELECT
          c.id,
          CASE WHEN b.customer_id = $2 THEN b.provider_id ELSE b.customer_id END AS "otherUserId",
          r.public_code AS "requestCode"
        FROM conversations c
        JOIN bookings b ON b.id = c.booking_id
        JOIN service_requests r ON r.id = b.request_id
        WHERE c.id = $1
      `, [conversationId, actor.id]);
      if (!conversation.rows[0]) throw new NotFoundException("Conversa não encontrada.");
      const result = await client.query(`
        SELECT
          m.id,
          m.conversation_id AS "conversationId",
          m.sender_id AS "senderId",
          u.display_name AS "senderName",
          u.public_code AS "senderCode",
          m.body,
          m.created_at AS "createdAt"
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1
        ORDER BY m.created_at, m.id
        LIMIT 200
      `, [conversationId]);
      return result.rows;
    });
  }

  async send(actor: Actor, conversationId: string, body: string) {
    if (actor.role !== "customer" && actor.role !== "provider") {
      throw new ForbiddenException("Este perfil não pode enviar mensagens nesta conversa.");
    }

    return this.database.withActor(actor, async (client) => {
      const conversation = await client.query<{ id: string; otherUserId: string; requestCode: string }>(`
        SELECT
          c.id,
          CASE WHEN b.customer_id = $2 THEN b.provider_id ELSE b.customer_id END AS "otherUserId",
          r.public_code AS "requestCode"
        FROM conversations c
        JOIN bookings b ON b.id = c.booking_id
        JOIN service_requests r ON r.id = b.request_id
        WHERE c.id = $1
      `, [conversationId, actor.id]);
      if (!conversation.rows[0]) throw new NotFoundException("Conversa não encontrada.");

      const id = randomUUID();
      const result = await client.query(`
        INSERT INTO messages (id, conversation_id, sender_id, body)
        VALUES ($1, $2, $3, $4)
        RETURNING id, conversation_id AS "conversationId", sender_id AS "senderId", body, created_at AS "createdAt"
      `, [id, conversationId, actor.id, body.trim()]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'message.sent', 'message', $3, $4::jsonb)",
        [actor.id, actor.role, id, JSON.stringify({ conversationId })],
      );
      await createNotification(client, {
        userId: conversation.rows[0].otherUserId,
        actorId: actor.id,
        type: "message_received",
        title: `Nova mensagem · ${conversation.rows[0].requestCode}`,
        body: body.trim().slice(0, 180),
        entityType: "conversation",
        entityId: conversationId,
      });
      return result.rows[0];
    });
  }
}
