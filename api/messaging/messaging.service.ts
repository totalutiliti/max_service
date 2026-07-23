import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { createNotification } from "../notifications/notification-writer.js";
import { PrivateObjectStorageService } from "../storage/private-object-storage.service.js";
import { validatePrivateImage } from "../storage/private-image-validation.js";

@Injectable()
export class MessagingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

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
          m.created_at AS "createdAt",
          attachment.file AS attachment
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN LATERAL (
          SELECT jsonb_build_object(
            'id', file.id,
            'fileName', file.original_name,
            'contentType', file.content_type,
            'sizeBytes', file.size_bytes,
            'sha256', file.sha256,
            'createdAt', file.created_at
          ) AS file
          FROM message_attachments file
          WHERE file.message_id = m.id
          LIMIT 1
        ) attachment ON true
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

    const messageBody = body.trim();
    if (!messageBody) throw new BadRequestException("Escreva uma mensagem antes de enviar.");

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
      `, [id, conversationId, actor.id, messageBody]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'message.sent', 'message', $3, $4::jsonb)",
        [actor.id, actor.role, id, JSON.stringify({ conversationId })],
      );
      await createNotification(client, {
        userId: conversation.rows[0].otherUserId,
        actorId: actor.id,
        type: "message_received",
        title: `Nova mensagem · ${conversation.rows[0].requestCode}`,
        body: messageBody.slice(0, 180),
        entityType: "conversation",
        entityId: conversationId,
      });
      return { ...result.rows[0], attachment: null };
    });
  }

  async sendWithAttachment(
    actor: Actor,
    conversationId: string,
    body: string,
    originalName: string,
    contentType: string,
    bytes: Buffer,
  ) {
    if (actor.role !== "customer" && actor.role !== "provider") {
      throw new ForbiddenException("Este perfil não pode enviar anexos nesta conversa.");
    }
    const caption = body.trim();
    if (caption.length > 2000) throw new BadRequestException("A mensagem deve ter no máximo 2.000 caracteres.");
    const messageBody = caption || "Imagem anexada";
    const fileName = validatePrivateImage(originalName, contentType, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const messageId = randomUUID();
    const attachmentId = randomUUID();

    const preflight = await this.database.withActor(actor, async (client) => {
      const result = await client.query(`
        SELECT c.id
        FROM conversations c
        WHERE c.id = $1
      `, [conversationId]);
      return result.rows[0];
    });
    if (!preflight) throw new NotFoundException("Conversa não encontrada.");

    const objectKey = `conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`;
    await this.storage.put(objectKey, bytes, contentType, sha256);
    try {
      return await this.database.withActor(actor, async (client) => {
        const conversation = await client.query<{ otherUserId: string; requestCode: string }>(`
          SELECT
            CASE WHEN b.customer_id = $2 THEN b.provider_id ELSE b.customer_id END AS "otherUserId",
            r.public_code AS "requestCode"
          FROM conversations c
          JOIN bookings b ON b.id = c.booking_id
          JOIN service_requests r ON r.id = b.request_id
          WHERE c.id = $1
        `, [conversationId, actor.id]);
        if (!conversation.rows[0]) throw new NotFoundException("Conversa não encontrada.");

        const message = await client.query(`
          INSERT INTO messages (id, conversation_id, sender_id, body)
          VALUES ($1, $2, $3, $4)
          RETURNING id, conversation_id AS "conversationId", sender_id AS "senderId", body, created_at AS "createdAt"
        `, [messageId, conversationId, actor.id, messageBody]);
        const attachment = await client.query(`
          INSERT INTO message_attachments (
            id, message_id, conversation_id, sender_id, object_key, original_name,
            content_type, size_bytes, sha256, uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $4)
          RETURNING
            id,
            original_name AS "fileName",
            content_type AS "contentType",
            size_bytes AS "sizeBytes",
            sha256,
            created_at AS "createdAt"
        `, [attachmentId, messageId, conversationId, actor.id, objectKey, fileName, contentType, bytes.length, sha256]);
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'message.attachment_sent', 'message_attachment', $3, $4::jsonb)",
          [actor.id, actor.role, attachmentId, JSON.stringify({ conversationId, messageId, contentType, sizeBytes: bytes.length, sha256 })],
        );
        await createNotification(client, {
          userId: conversation.rows[0].otherUserId,
          actorId: actor.id,
          type: "message_received",
          title: `Nova imagem · ${conversation.rows[0].requestCode}`,
          body: caption ? caption.slice(0, 180) : "Enviou uma imagem privada na conversa.",
          entityType: "conversation",
          entityId: conversationId,
        });
        return { ...message.rows[0], attachment: attachment.rows[0] };
      });
    } catch (error) {
      await this.storage.remove(objectKey);
      throw error;
    }
  }

  async downloadAttachment(actor: Actor, attachmentId: string) {
    if (actor.role !== "customer" && actor.role !== "provider") {
      throw new ForbiddenException("Perfil sem acesso aos anexos privados da conversa.");
    }
    const record = await this.database.withActor(actor, async (client) => {
      const result = await client.query<{
        id: string;
        conversationId: string;
        messageId: string;
        objectKey: string;
        originalName: string;
        contentType: string;
        sizeBytes: number;
        sha256: string;
      }>(`
        SELECT
          file.id,
          file.conversation_id AS "conversationId",
          file.message_id AS "messageId",
          file.object_key AS "objectKey",
          file.original_name AS "originalName",
          file.content_type AS "contentType",
          file.size_bytes AS "sizeBytes",
          file.sha256
        FROM message_attachments file
        WHERE file.id = $1
      `, [attachmentId]);
      return result.rows[0];
    });
    if (!record) throw new NotFoundException("Anexo privado não encontrado.");
    const bytes = await this.storage.get(record.objectKey);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== record.sizeBytes || actualHash !== record.sha256) {
      throw new ConflictException("A integridade do anexo privado não pôde ser confirmada.");
    }
    await this.database.withActor(actor, async (client) => {
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'message.attachment_downloaded', 'message_attachment', $3, $4::jsonb)",
        [actor.id, actor.role, attachmentId, JSON.stringify({ conversationId: record.conversationId, messageId: record.messageId, contentType: record.contentType, sizeBytes: record.sizeBytes, sha256: record.sha256 })],
      );
    });
    return { ...record, bytes };
  }
}
