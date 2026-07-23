import { createHash, randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { createNotification } from "../notifications/notification-writer.js";
import { PrivateObjectStorageService } from "../storage/private-object-storage.service.js";
import type { CreateProposalDto, CreateServiceRequestDto } from "./marketplace.dto.js";
import { maximumRequestAttachmentCount, validateRequestAttachment } from "./request-attachment-validation.js";

interface RequestAttachmentRow {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}

interface ServiceRequestRow {
  id: string;
  publicCode: string;
  title: string;
  description: string;
  neighborhood: string;
  city: string;
  state: string;
  preferredWindow: string;
  status: string;
  createdAt: Date;
  categoryName: string;
  categoryIcon: string;
  proposalCount: number;
  hasActorProposal: boolean;
  attachments: RequestAttachmentRow[];
}

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  async categories() {
    const result = await this.database.query<{
      id: string;
      slug: string;
      name: string;
      icon: string;
    }>("SELECT id, slug, name, icon FROM service_categories WHERE active = true ORDER BY sort_order, name");
    return result.rows;
  }

  async listRequests(actor: Actor) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<ServiceRequestRow>(`
        SELECT
          r.id,
          r.public_code AS "publicCode",
          r.title,
          r.description,
          r.neighborhood,
          r.city,
          r.state,
          r.preferred_window AS "preferredWindow",
          r.status,
          r.created_at AS "createdAt",
          c.name AS "categoryName",
          c.icon AS "categoryIcon",
          COUNT(p.id)::int AS "proposalCount",
          EXISTS (
            SELECT 1 FROM proposals own_proposal
            WHERE own_proposal.request_id = r.id
              AND own_proposal.provider_id = $2::uuid
          ) AS "hasActorProposal",
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', attachment.id,
              'fileName', attachment.original_name,
              'contentType', attachment.content_type,
              'sizeBytes', attachment.size_bytes,
              'sha256', attachment.sha256,
              'createdAt', attachment.created_at
            ) ORDER BY attachment.created_at, attachment.id)
            FROM service_request_attachments attachment
            WHERE attachment.request_id = r.id
          ), '[]'::jsonb) AS attachments
        FROM service_requests r
        JOIN service_categories c ON c.id = r.category_id
        LEFT JOIN proposals p ON p.request_id = r.id
        WHERE ($1::text <> 'provider' OR r.status IN ('open', 'proposals_received'))
        GROUP BY r.id, c.id
        ORDER BY r.created_at DESC
        LIMIT 50
      `, [actor.role, actor.id]);
      return result.rows;
    });
  }

  async createRequest(actor: Actor, input: CreateServiceRequestDto) {
    if (actor.role !== "customer") throw new ForbiddenException("Somente clientes podem criar solicitações.");

    return this.database.withActor(actor, async (client) => {
      const category = await client.query<{ id: string }>(
        "SELECT id FROM service_categories WHERE slug = $1 AND active = true",
        [input.categorySlug],
      );
      if (!category.rows[0]) throw new BadRequestException("Categoria indisponível.");

      const id = randomUUID();
      const publicCode = `SV-${randomBytes(3).toString("hex").toUpperCase()}`;
      const created = await client.query<ServiceRequestRow>(`
        INSERT INTO service_requests (
          id, public_code, customer_id, category_id, title, description,
          neighborhood, city, state, preferred_window, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open')
        RETURNING
          id, public_code AS "publicCode", title, description, neighborhood, city,
          state, preferred_window AS "preferredWindow", status, created_at AS "createdAt"
      `, [id, publicCode, actor.id, category.rows[0].id, input.title, input.description, input.neighborhood, input.city, input.state.toUpperCase(), input.preferredWindow]);

      await client.query(
        "INSERT INTO request_status_history (request_id, status, actor_id, note) VALUES ($1, 'open', $2, $3)",
        [id, actor.id, "Solicitação criada pelo cliente."],
      );
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'service_request.created', 'service_request', $3, $4::jsonb)",
        [actor.id, actor.role, id, JSON.stringify({ publicCode, categorySlug: input.categorySlug })],
      );

      return created.rows[0];
    });
  }

  async uploadRequestAttachment(actor: Actor, requestId: string, originalName: string, contentType: string, bytes: Buffer) {
    if (actor.role !== "customer") throw new ForbiddenException("Somente clientes podem anexar imagens ao pedido.");
    const fileName = validateRequestAttachment(originalName, contentType, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const attachmentId = randomUUID();
    const request = await this.database.withActor(actor, async (client) => {
      const result = await client.query<{ id: string; publicCode: string }>(`
        SELECT id, public_code AS "publicCode"
        FROM service_requests
        WHERE id = $1 AND customer_id = $2 AND status IN ('open', 'proposals_received')
      `, [requestId, actor.id]);
      if (!result.rows[0]) return null;
      const count = await client.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM service_request_attachments WHERE request_id = $1",
        [requestId],
      );
      return { ...result.rows[0], attachmentCount: count.rows[0]?.total ?? 0 };
    });
    if (!request) throw new NotFoundException("Pedido não encontrado ou indisponível para anexos.");
    if (request.attachmentCount >= maximumRequestAttachmentCount) {
      throw new ConflictException("O pedido já possui o limite de 3 imagens.");
    }

    const objectKey = `service-requests/${requestId}/attachments/${attachmentId}`;
    await this.storage.put(objectKey, bytes, contentType, sha256);
    try {
      return await this.database.withActor(actor, async (client) => {
        const result = await client.query<RequestAttachmentRow>(`
          INSERT INTO service_request_attachments (
            id, request_id, customer_id, object_key, original_name,
            content_type, size_bytes, sha256, uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $3)
          RETURNING
            id,
            original_name AS "fileName",
            content_type AS "contentType",
            size_bytes AS "sizeBytes",
            sha256,
            created_at AS "createdAt"
        `, [attachmentId, requestId, actor.id, objectKey, fileName, contentType, bytes.length, sha256]);
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'service_request.attachment_uploaded', 'service_request_attachment', $3, $4::jsonb)",
          [actor.id, actor.role, attachmentId, JSON.stringify({ requestId, publicCode: request.publicCode, contentType, sizeBytes: bytes.length, sha256 })],
        );
        return result.rows[0];
      });
    } catch (error) {
      await this.storage.remove(objectKey);
      if (error instanceof Error && error.message.includes("service_request_attachment_limit")) {
        throw new ConflictException("O pedido já possui o limite de 3 imagens.");
      }
      throw error;
    }
  }

  async downloadRequestAttachment(actor: Actor, attachmentId: string) {
    if (actor.role !== "customer" && actor.role !== "provider" && actor.role !== "operation") {
      throw new ForbiddenException("Perfil sem acesso às imagens privadas do pedido.");
    }
    const record = await this.database.withActor(actor, async (client) => {
      const result = await client.query<{
        id: string;
        requestId: string;
        objectKey: string;
        originalName: string;
        contentType: string;
        sizeBytes: number;
        sha256: string;
      }>(`
        SELECT
          attachment.id,
          attachment.request_id AS "requestId",
          attachment.object_key AS "objectKey",
          attachment.original_name AS "originalName",
          attachment.content_type AS "contentType",
          attachment.size_bytes AS "sizeBytes",
          attachment.sha256
        FROM service_request_attachments attachment
        WHERE attachment.id = $1
      `, [attachmentId]);
      return result.rows[0];
    });
    if (!record) throw new NotFoundException("Imagem privada não encontrada.");
    const bytes = await this.storage.get(record.objectKey);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== record.sizeBytes || actualHash !== record.sha256) {
      throw new ConflictException("A integridade da imagem privada não pôde ser confirmada.");
    }
    await this.database.withActor(actor, async (client) => {
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'service_request.attachment_downloaded', 'service_request_attachment', $3, $4::jsonb)",
        [actor.id, actor.role, attachmentId, JSON.stringify({ requestId: record.requestId, contentType: record.contentType, sizeBytes: record.sizeBytes, sha256: record.sha256 })],
      );
    });
    return { ...record, bytes };
  }

  async listProposals(actor: Actor, requestId: string) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`
        SELECT
          p.id,
          p.request_id AS "requestId",
          p.amount_cents AS "amountCents",
          p.estimated_minutes AS "estimatedMinutes",
          p.message,
          p.status,
          p.created_at AS "createdAt",
          u.display_name AS "providerName",
          u.public_code AS "providerCode"
        FROM proposals p
        JOIN users u ON u.id = p.provider_id
        WHERE p.request_id = $1
        ORDER BY p.amount_cents, p.created_at
      `, [requestId]);
      return result.rows;
    });
  }

  async createProposal(actor: Actor, requestId: string, input: CreateProposalDto) {
    if (actor.role !== "provider") throw new ForbiddenException("Somente profissionais podem enviar propostas.");
    return this.database.withActor(actor, async (client) => {
      const request = await client.query<{ id: string; status: string; customerId: string; publicCode: string }>(
        "SELECT id, status, customer_id AS \"customerId\", public_code AS \"publicCode\" FROM service_requests WHERE id = $1 AND status IN ('open', 'proposals_received')",
        [requestId],
      );
      if (!request.rows[0]) throw new NotFoundException("Solicitação não encontrada ou indisponível.");

      const result = await client.query(`
        INSERT INTO proposals (id, request_id, provider_id, amount_cents, estimated_minutes, message, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'sent')
        ON CONFLICT (request_id, provider_id) DO UPDATE SET
          amount_cents = EXCLUDED.amount_cents,
          estimated_minutes = EXCLUDED.estimated_minutes,
          message = EXCLUDED.message,
          updated_at = now()
        RETURNING id, request_id AS "requestId", amount_cents AS "amountCents", status, created_at AS "createdAt"
      `, [randomUUID(), requestId, actor.id, input.amountCents, input.estimatedMinutes, input.message]);

      const moved = await client.query(
        "UPDATE service_requests SET status = 'proposals_received', updated_at = now() WHERE id = $1 AND status = 'open' RETURNING id",
        [requestId],
      );
      if (moved.rowCount) {
        await client.query(
          "INSERT INTO request_status_history (request_id, status, actor_id, note) VALUES ($1, 'proposals_received', $2, 'Primeira proposta recebida.')",
          [requestId, actor.id],
        );
      }
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'proposal.upserted', 'proposal', $3, $4::jsonb)",
        [actor.id, actor.role, result.rows[0].id, JSON.stringify({ requestId, amountCents: input.amountCents })],
      );
      const provider = await client.query<{ displayName: string }>("SELECT display_name AS \"displayName\" FROM users WHERE id = $1", [actor.id]);
      await createNotification(client, {
        userId: request.rows[0].customerId,
        actorId: actor.id,
        type: "proposal_received",
        title: `Nova proposta para ${request.rows[0].publicCode}`,
        body: `${provider.rows[0]?.displayName ?? "Um profissional"} enviou uma proposta para o seu pedido.`,
        entityType: "proposal",
        entityId: result.rows[0].id,
      });
      return result.rows[0];
    });
  }

  async acceptProposal(actor: Actor, proposalId: string) {
    if (actor.role !== "customer") throw new ForbiddenException("Somente o cliente pode aceitar uma proposta.");
    return this.database.withActor(actor, async (client) => {
      const accepted = await client.query<{ id: string; requestId: string; providerId: string }>(`
        UPDATE proposals p
        SET status = 'accepted', updated_at = now()
        WHERE p.id = $1
          AND p.status = 'sent'
          AND EXISTS (
            SELECT 1 FROM service_requests r
            WHERE r.id = p.request_id
              AND r.customer_id = $2
              AND r.status = 'proposals_received'
          )
        RETURNING p.id, p.request_id AS "requestId", p.provider_id AS "providerId"
      `, [proposalId, actor.id]);
      if (!accepted.rows[0]) throw new NotFoundException("Proposta não encontrada.");

      await client.query("UPDATE proposals SET status = 'declined', updated_at = now() WHERE request_id = $1 AND id <> $2", [accepted.rows[0].requestId, proposalId]);
      await client.query("UPDATE service_requests SET status = 'booked', updated_at = now() WHERE id = $1", [accepted.rows[0].requestId]);
      await client.query("INSERT INTO request_status_history (request_id, status, actor_id, note) VALUES ($1, 'booked', $2, 'Proposta aceita pelo cliente.')", [accepted.rows[0].requestId, actor.id]);
      const bookingId = randomUUID();
      const conversationId = randomUUID();
      const booking = await client.query<{ scheduledFor: Date }>(`
        INSERT INTO bookings (id, request_id, proposal_id, customer_id, provider_id, status, scheduled_for)
        VALUES (
          $1, $2, $3, $4, $5, 'scheduled',
          (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day 9 hours')
            AT TIME ZONE 'America/Sao_Paulo'
        )
        RETURNING scheduled_for AS "scheduledFor"
      `, [bookingId, accepted.rows[0].requestId, proposalId, actor.id, accepted.rows[0].providerId]);
      await client.query(
        "INSERT INTO booking_status_history (booking_id, status, actor_id, note) VALUES ($1, 'scheduled', $2, 'Agendamento criado a partir da proposta aceita.')",
        [bookingId, actor.id],
      );
      await client.query("INSERT INTO conversations (id, booking_id) VALUES ($1, $2)", [conversationId, bookingId]);
      await client.query(
        "INSERT INTO conversation_members (conversation_id, user_id, member_role) VALUES ($1, $2, 'customer'), ($1, $3, 'provider')",
        [conversationId, actor.id, accepted.rows[0].providerId],
      );
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'proposal.accepted', 'proposal', $3, $4::jsonb)",
        [actor.id, actor.role, proposalId, JSON.stringify({ requestId: accepted.rows[0].requestId })],
      );
      const notificationContext = await client.query<{ publicCode: string; customerName: string }>(`
        SELECT r.public_code AS "publicCode", customer.display_name AS "customerName"
        FROM service_requests r
        JOIN users customer ON customer.id = r.customer_id
        WHERE r.id = $1
      `, [accepted.rows[0].requestId]);
      await createNotification(client, {
        userId: accepted.rows[0].providerId,
        actorId: actor.id,
        type: "proposal_accepted",
        title: `Proposta aceita · ${notificationContext.rows[0].publicCode}`,
        body: `${notificationContext.rows[0].customerName} confirmou sua proposta. O serviço já está na agenda.`,
        entityType: "proposal",
        entityId: proposalId,
      });
      return { proposalId, requestId: accepted.rows[0].requestId, bookingId, conversationId, scheduledFor: booking.rows[0].scheduledFor, status: "booked" };
    });
  }
}
