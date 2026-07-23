import { createHash, randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/demo-actor.js";
import { CampaignsService } from "../campaigns/campaigns.service.js";
import { DatabaseService } from "../database/database.service.js";
import { createNotification } from "../notifications/notification-writer.js";
import { PrivateObjectStorageService } from "../storage/private-object-storage.service.js";
import type { CreateProposalDto, CreateServiceRequestDto, UpdateProviderMatchingDto } from "./marketplace.dto.js";
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
  regionId: string;
  neighborhoodId: string;
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
  matchScore: number;
  matchReasons: string[];
  isUrgent: boolean;
  attachments: RequestAttachmentRow[];
}

interface ProviderMatchingRow {
  providerId: string;
  primaryCategoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryActive: boolean;
  availabilityStatus: "available_now" | "scheduled" | "paused";
  acceptsUrgent: boolean;
  activeProposalLimit: number;
  activeJobLimit: number;
  version: number;
  updatedAt: Date;
  verificationStatus: "submitted" | "in_review" | "changes_requested" | "approved" | null;
  activeRegionCount: number;
  activeProposalCount: number;
  activeJobCount: number;
}

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: PrivateObjectStorageService,
    private readonly campaigns: CampaignsService,
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

  async regions() {
    const result = await this.database.query<{
      id: string;
      code: string;
      name: string;
      city: string;
      state: string;
      neighborhoods: Array<{ id: string; slug: string; name: string }>;
    }>(`
      SELECT
        region.id,
        region.code,
        region.name,
        region.city,
        region.state,
        COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', neighborhood.id,
            'slug', neighborhood.slug,
            'name', neighborhood.name
          )
          ORDER BY neighborhood.sort_order, neighborhood.name
        ) FILTER (WHERE neighborhood.id IS NOT NULL), '[]'::jsonb) AS neighborhoods
      FROM service_regions region
      LEFT JOIN service_region_neighborhoods neighborhood
        ON neighborhood.region_id = region.id AND neighborhood.active = true
      WHERE region.active = true
      GROUP BY region.id
      HAVING count(neighborhood.id) > 0
      ORDER BY region.sort_order, region.name
    `);
    return result.rows;
  }

  async listRequests(actor: Actor) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<ServiceRequestRow>(`
        SELECT
          r.id,
          r.public_code AS "publicCode",
          r.region_id AS "regionId",
          r.neighborhood_id AS "neighborhoodId",
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
          CASE WHEN $1::text = 'provider' THEN LEAST(100,
            70
            + CASE WHEN r.preferred_window ILIKE '%quanto antes%'
              AND COALESCE((
                SELECT matching.accepts_urgent
                FROM provider_matching_profiles matching
                WHERE matching.provider_id = $2::uuid
              ), false) THEN 20 ELSE 0 END
            + CASE WHEN r.created_at >= now() - interval '60 minutes' THEN 10 ELSE 0 END
            + CASE WHEN EXISTS (
              SELECT 1 FROM proposals own_proposal
              WHERE own_proposal.request_id = r.id
                  AND own_proposal.provider_id = $2::uuid
              ) THEN 15 ELSE 0 END
            )
          ELSE 0 END AS "matchScore",
          CASE WHEN $1::text = 'provider' THEN to_jsonb(array_remove(ARRAY[
            'Categoria principal'::text,
            'Cobertura ativa'::text,
            'Perfil aprovado'::text,
            CASE WHEN r.preferred_window ILIKE '%quanto antes%'
              AND COALESCE((
                SELECT matching.accepts_urgent
                FROM provider_matching_profiles matching
                WHERE matching.provider_id = $2::uuid
              ), false) THEN 'Aceita urgência'::text ELSE NULL END,
            CASE WHEN r.created_at >= now() - interval '60 minutes'
              THEN 'Pedido recente'::text ELSE NULL END
          ], NULL)) ELSE '[]'::jsonb END AS "matchReasons",
          (r.preferred_window ILIKE '%quanto antes%') AS "isUrgent",
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
        ORDER BY "matchScore" DESC, r.created_at DESC
        LIMIT 50
      `, [actor.role, actor.id]);
      return result.rows;
    });
  }

  async providerMatching(actor: Actor) {
    if (actor.role !== "provider") {
      throw new ForbiddenException("Somente profissionais podem configurar oportunidades.");
    }
    return this.database.withActor(actor, (client) => this.loadProviderMatchingView(client, actor));
  }

  async updateProviderMatching(actor: Actor, input: UpdateProviderMatchingDto) {
    if (actor.role !== "provider") {
      throw new ForbiddenException("Somente profissionais podem configurar oportunidades.");
    }
    return this.database.withActor(actor, async (client) => {
      const currentResult = await client.query<{
        availabilityStatus: UpdateProviderMatchingDto["availabilityStatus"];
        acceptsUrgent: boolean;
        activeProposalLimit: number;
        activeJobLimit: number;
        version: number;
      }>(`
        SELECT
          availability_status AS "availabilityStatus",
          accepts_urgent AS "acceptsUrgent",
          active_proposal_limit AS "activeProposalLimit",
          active_job_limit AS "activeJobLimit",
          version
        FROM provider_matching_profiles
        WHERE provider_id = $1
        FOR UPDATE
      `, [actor.id]);
      const current = currentResult.rows[0];
      if (!current) throw new NotFoundException("Perfil de oportunidades não configurado.");
      const changed = current.availabilityStatus !== input.availabilityStatus
        || current.acceptsUrgent !== input.acceptsUrgent
        || current.activeProposalLimit !== input.activeProposalLimit
        || current.activeJobLimit !== input.activeJobLimit;
      if (changed) {
        const version = current.version + 1;
        await client.query(`
          UPDATE provider_matching_profiles
          SET
            availability_status = $2,
            accepts_urgent = $3,
            active_proposal_limit = $4,
            active_job_limit = $5,
            version = $6,
            updated_at = now()
          WHERE provider_id = $1
        `, [
          actor.id,
          input.availabilityStatus,
          input.acceptsUrgent,
          input.activeProposalLimit,
          input.activeJobLimit,
          version,
        ]);
        const eventId = randomUUID();
        await client.query(`
          INSERT INTO provider_matching_events (
            id, provider_id, actor_id, event_type, profile_version, snapshot
          ) VALUES ($1, $2, $2, 'updated', $3, $4::jsonb)
        `, [
          eventId,
          actor.id,
          version,
          JSON.stringify({
            availabilityStatus: input.availabilityStatus,
            acceptsUrgent: input.acceptsUrgent,
            activeProposalLimit: input.activeProposalLimit,
            activeJobLimit: input.activeJobLimit,
          }),
        ]);
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'provider_matching.updated', 'provider_matching', $3, $4::jsonb)",
          [actor.id, actor.role, actor.id, JSON.stringify({ version, eventId, source: "provider_dashboard" })],
        );
      }
      return this.loadProviderMatchingView(client, actor);
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

      const location = await client.query<{
        regionId: string;
        neighborhoodId: string;
        city: string;
        state: string;
        neighborhood: string;
      }>(`
        SELECT
          region.id AS "regionId",
          neighborhood.id AS "neighborhoodId",
          region.city,
          region.state,
          neighborhood.name AS neighborhood
        FROM service_regions region
        JOIN service_region_neighborhoods neighborhood
          ON neighborhood.region_id = region.id
        WHERE region.id = $1
          AND neighborhood.id = $2
          AND region.active = true
          AND neighborhood.active = true
      `, [input.regionId, input.neighborhoodId]);
      if (!location.rows[0]) {
        throw new BadRequestException("Selecione uma região e um bairro ativos do piloto.");
      }

      const id = randomUUID();
      const publicCode = `SV-${randomBytes(3).toString("hex").toUpperCase()}`;
      const selectedLocation = location.rows[0];
      const created = await client.query<ServiceRequestRow>(`
        INSERT INTO service_requests (
          id, public_code, customer_id, category_id, title, description,
          neighborhood, city, state, preferred_window, status, region_id, neighborhood_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open', $11, $12)
        RETURNING
          id, public_code AS "publicCode", region_id AS "regionId",
          neighborhood_id AS "neighborhoodId", title, description, neighborhood, city,
          state, preferred_window AS "preferredWindow", status, created_at AS "createdAt"
      `, [
        id,
        publicCode,
        actor.id,
        category.rows[0].id,
        input.title,
        input.description,
        selectedLocation.neighborhood,
        selectedLocation.city,
        selectedLocation.state,
        input.preferredWindow,
        selectedLocation.regionId,
        selectedLocation.neighborhoodId,
      ]);

      await client.query(
        "INSERT INTO request_status_history (request_id, status, actor_id, note) VALUES ($1, 'open', $2, $3)",
        [id, actor.id, "Solicitação criada pelo cliente."],
      );
      const campaign = await this.campaigns.reserveForRequest(client, actor, id, input.couponCode);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'service_request.created', 'service_request', $3, $4::jsonb)",
        [actor.id, actor.role, id, JSON.stringify({
          publicCode,
          categorySlug: input.categorySlug,
          regionId: selectedLocation.regionId,
          neighborhoodId: selectedLocation.neighborhoodId,
          campaignReservationId: campaign?.reservationId ?? null,
        })],
      );

      return { ...created.rows[0], campaign };
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
      const matching = await this.loadProviderMatching(client, actor.id);
      if (!matching) throw new ConflictException("Configure o perfil de oportunidades antes de enviar propostas.");
      const existingProposal = await client.query<{ id: string }>(
        "SELECT id FROM proposals WHERE request_id = $1 AND provider_id = $2",
        [requestId, actor.id],
      );
      const blockers = this.providerMatchingBlockers(matching, Boolean(existingProposal.rows[0]));
      if (blockers.length > 0) throw new ConflictException(blockers[0]);
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

  private async loadProviderMatching(client: PoolClient, providerId: string) {
    const result = await client.query<ProviderMatchingRow>(`
      SELECT
        matching.provider_id AS "providerId",
        matching.primary_category_id AS "primaryCategoryId",
        category.name AS "categoryName",
        category.icon AS "categoryIcon",
        category.active AS "categoryActive",
        matching.availability_status AS "availabilityStatus",
        matching.accepts_urgent AS "acceptsUrgent",
        matching.active_proposal_limit AS "activeProposalLimit",
        matching.active_job_limit AS "activeJobLimit",
        matching.version,
        matching.updated_at AS "updatedAt",
        verification.status AS "verificationStatus",
        (
          SELECT count(*)::int
          FROM provider_service_regions coverage
          JOIN service_regions region ON region.id = coverage.region_id
          WHERE coverage.provider_id = matching.provider_id
            AND coverage.active = true
            AND region.active = true
        ) AS "activeRegionCount",
        (
          SELECT count(*)::int
          FROM proposals proposal
          WHERE proposal.provider_id = matching.provider_id
            AND proposal.status = 'sent'
        ) AS "activeProposalCount",
        (
          SELECT count(*)::int
          FROM bookings booking
          WHERE booking.provider_id = matching.provider_id
            AND booking.status IN ('scheduled', 'in_progress')
        ) AS "activeJobCount"
      FROM provider_matching_profiles matching
      JOIN service_categories category ON category.id = matching.primary_category_id
      LEFT JOIN provider_verifications verification ON verification.provider_id = matching.provider_id
      WHERE matching.provider_id = $1
    `, [providerId]);
    return result.rows[0] ?? null;
  }

  private providerMatchingBlockers(matching: ProviderMatchingRow, ignoreCapacity = false) {
    const blockers: string[] = [];
    if (matching.verificationStatus !== "approved") blockers.push("O perfil profissional precisa estar aprovado.");
    if (!matching.categoryActive) blockers.push("A categoria principal está indisponível.");
    if (matching.activeRegionCount === 0) blockers.push("Ative ao menos uma região de atendimento.");
    if (matching.availabilityStatus === "paused") blockers.push("O recebimento de oportunidades está pausado.");
    if (!ignoreCapacity && matching.activeProposalCount >= matching.activeProposalLimit) blockers.push("O limite de propostas ativas foi atingido.");
    if (!ignoreCapacity && matching.activeJobCount >= matching.activeJobLimit) blockers.push("A capacidade de serviços em andamento foi atingida.");
    return blockers;
  }

  private async loadProviderMatchingView(client: PoolClient, actor: Actor) {
    const matching = await this.loadProviderMatching(client, actor.id);
    if (!matching) throw new NotFoundException("Perfil de oportunidades não configurado.");
    const regions = await client.query<{ id: string; name: string; state: string }>(`
      SELECT region.id, region.name, region.state
      FROM provider_service_regions coverage
      JOIN service_regions region ON region.id = coverage.region_id
      WHERE coverage.provider_id = $1
        AND coverage.active = true
        AND region.active = true
      ORDER BY region.sort_order, region.name
    `, [actor.id]);
    const history = await client.query<{
      id: string;
      eventType: "configured" | "updated";
      profileVersion: number;
      createdAt: Date;
    }>(`
      SELECT
        id,
        event_type AS "eventType",
        profile_version AS "profileVersion",
        created_at AS "createdAt"
      FROM provider_matching_events
      WHERE provider_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 10
    `, [actor.id]);
    const blockers = this.providerMatchingBlockers(matching);
    return {
      profile: {
        ...matching,
        eligible: blockers.length === 0,
        remainingProposalCapacity: Math.max(0, matching.activeProposalLimit - matching.activeProposalCount),
        remainingJobCapacity: Math.max(0, matching.activeJobLimit - matching.activeJobCount),
      },
      blockers,
      regions: regions.rows,
      history: history.rows,
    };
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
