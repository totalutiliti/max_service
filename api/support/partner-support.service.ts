import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { idempotencyDerivedUuid } from "../idempotency/idempotency.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import { createNotification } from "../notifications/notification-writer.js";
import { PrivateObjectStorageService } from "../storage/private-object-storage.service.js";
import { validatePartnerSupportAttachment } from "./partner-support-attachment-validation.js";
import type { CreatePartnerSupportCaseDto } from "./partner-support.dto.js";

const supportCaseSelect = `
  SELECT
    support.id,
    support.public_code AS "publicCode",
    support.topic,
    support.priority,
    support.status,
    support.subject,
    support.resolution,
    support.sla_policy_version AS "slaPolicyVersion",
    support.first_response_due_at AS "firstResponseDueAt",
    support.resolution_due_at AS "resolutionDueAt",
    support.first_responded_at AS "firstRespondedAt",
    support.created_at AS "createdAt",
    support.updated_at AS "updatedAt",
    support.resolved_at AS "resolvedAt",
    partner.display_name AS "partnerName",
    partner.public_code AS "partnerCode",
    support.assigned_to AS "assignedToId",
    CASE
      WHEN support.assigned_to IS NULL THEN NULL
      ELSE COALESCE(assignee.display_name, 'Equipe Max')
    END AS "assignedToName",
    referral.id AS "referralId",
    referral.public_code AS "referralCode",
    referral.professional_name AS "referralName",
    category.name AS "categoryName",
    category.icon AS "categoryIcon",
    latest_event.body AS "latestEventBody",
    latest_event.event_type AS "latestEventType",
    latest_event.created_at AS "latestEventAt",
    CASE
      WHEN latest_event.actor_id = support.partner_id THEN partner.display_name
      WHEN latest_event.actor_id IS NOT NULL THEN 'Equipe Max'
      ELSE NULL
    END AS "latestActorName",
    CASE
      WHEN latest_event.actor_id = support.partner_id THEN 'partner'
      WHEN latest_event.actor_id IS NOT NULL THEN 'operation'
      ELSE NULL
    END AS "latestActorRole",
    CASE
      WHEN support.first_responded_at IS NULL AND now() > support.first_response_due_at THEN 'breached'
      WHEN support.first_responded_at > support.first_response_due_at THEN 'breached'
      WHEN support.first_responded_at IS NOT NULL THEN 'met'
      ELSE 'pending'
    END AS "firstResponseSla",
    CASE
      WHEN support.resolved_at IS NULL AND now() > support.resolution_due_at THEN 'breached'
      WHEN support.resolved_at > support.resolution_due_at THEN 'breached'
      WHEN support.resolved_at IS NOT NULL THEN 'met'
      ELSE 'pending'
    END AS "resolutionSla",
    dispute_record.dispute AS dispute,
    (SELECT count(*)::int FROM partner_support_events event WHERE event.case_id = support.id) AS "eventCount"
  FROM partner_support_cases support
  JOIN users partner ON partner.id = support.partner_id
  LEFT JOIN users assignee ON assignee.id = support.assigned_to
  LEFT JOIN partner_referrals referral ON referral.id = support.referral_id
  LEFT JOIN service_categories category ON category.id = referral.service_category_id
  LEFT JOIN LATERAL (
    SELECT event.actor_id, event.event_type, event.body, event.created_at
    FROM partner_support_events event
    WHERE event.case_id = support.id
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1
  ) latest_event ON true
  LEFT JOIN LATERAL (
    SELECT
      dispute.status,
      jsonb_build_object(
        'id', dispute.id,
        'publicCode', dispute.public_code,
        'reason', dispute.reason,
        'statement', dispute.statement,
        'status', dispute.status,
        'assignedToId', dispute.assigned_to,
        'assignedToName', dispute_assignee.display_name,
        'decision', dispute.decision,
        'openedAt', dispute.opened_at,
        'reviewedAt', dispute.reviewed_at,
        'decidedAt', dispute.decided_at,
        'updatedAt', dispute.updated_at,
        'eventCount', (
          SELECT count(*)::int
          FROM partner_support_dispute_events dispute_event
          WHERE dispute_event.dispute_id = dispute.id
        )
      ) AS dispute
    FROM partner_support_disputes dispute
    LEFT JOIN users dispute_assignee ON dispute_assignee.id = dispute.assigned_to
    WHERE dispute.case_id = support.id
    LIMIT 1
  ) dispute_record ON true
`;

@Injectable()
export class PartnerSupportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: PrivateObjectStorageService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private ensureScope(actor: Actor, scope: "partner" | "operation") {
    if (actor.role !== scope) {
      throw new ForbiddenException(scope === "partner"
        ? "Somente parceiros podem acessar esta central."
        : "Somente a Operação pode atender estas solicitações.");
    }
  }

  private normalizeText(value: string, minimum: number, message: string) {
    const normalized = value.trim();
    if (normalized.length < minimum) throw new BadRequestException(message);
    return normalized;
  }

  async list(actor: Actor, scope: "partner" | "operation") {
    this.ensureScope(actor, scope);
    return this.database.withActor(actor, async (client) => {
      const cases = await client.query(`${supportCaseSelect}
        ORDER BY
          CASE
            WHEN dispute_record.status IN ('open', 'in_review') THEN 0
            ELSE 1
          END,
          CASE
            WHEN support.status <> 'resolved'
              AND (
                (support.first_responded_at IS NULL AND now() > support.first_response_due_at)
                OR support.first_responded_at > support.first_response_due_at
                OR now() > support.resolution_due_at
              )
            THEN 0
            ELSE 1
          END,
          CASE support.status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END,
          CASE support.priority WHEN 'high' THEN 0 ELSE 1 END,
          COALESCE(latest_event.created_at, support.created_at) DESC,
          support.id DESC
      `);
      const metrics = await client.query(`
        SELECT
          count(*)::int AS "totalCount",
          count(*) FILTER (WHERE support.status = 'open')::int AS "openCount",
          count(*) FILTER (WHERE support.status = 'in_review')::int AS "inReviewCount",
          count(*) FILTER (WHERE support.status = 'resolved')::int AS "resolvedCount",
          count(*) FILTER (
            WHERE support.status <> 'resolved'
              AND latest_event.actor_id = support.partner_id
          )::int AS "waitingOperationCount",
          count(*) FILTER (
            WHERE support.status <> 'resolved'
              AND support.assigned_to IS NULL
          )::int AS "unassignedCount",
          count(*) FILTER (
            WHERE support.status <> 'resolved'
              AND (
                (support.first_responded_at IS NULL AND now() > support.first_response_due_at)
                OR support.first_responded_at > support.first_response_due_at
                OR now() > support.resolution_due_at
              )
          )::int AS "slaBreachedCount",
          (
            SELECT count(*)::int
            FROM partner_support_disputes dispute
            WHERE dispute.status IN ('open', 'in_review')
          ) AS "activeDisputeCount"
        FROM partner_support_cases support
        LEFT JOIN LATERAL (
          SELECT event.actor_id
          FROM partner_support_events event
          WHERE event.case_id = support.id
          ORDER BY event.created_at DESC, event.id DESC
          LIMIT 1
        ) latest_event ON true
      `);
      const referrals = scope === "partner"
        ? await client.query(`
            SELECT
              referral.id,
              referral.public_code AS "publicCode",
              referral.professional_name AS "professionalName",
              referral.status,
              category.name AS "categoryName",
              category.icon AS "categoryIcon"
            FROM partner_referrals referral
            JOIN service_categories category ON category.id = referral.service_category_id
            WHERE referral.partner_id = $1
            ORDER BY referral.created_at DESC, referral.id DESC
          `, [actor.id])
        : { rows: [] };
      const operators = scope === "operation"
        ? await client.query(`
            SELECT
              id,
              public_code AS "publicCode",
              display_name AS "displayName"
            FROM users
            WHERE role = 'operation'
            ORDER BY display_name, id
          `)
        : { rows: [] };
      return {
        cases: cases.rows,
        metrics: metrics.rows[0],
        referrals: referrals.rows,
        operators: operators.rows,
      };
    });
  }

  async detail(actor: Actor, caseId: string, scope: "partner" | "operation") {
    this.ensureScope(actor, scope);
    return this.database.withActor(actor, async (client) => {
      const record = await client.query(`${supportCaseSelect} WHERE support.id = $1`, [caseId]);
      if (!record.rows[0]) throw new NotFoundException("Solicitação de atendimento não encontrada.");
      const events = await client.query(`
        SELECT
          event.id,
          event.event_type AS "eventType",
          event.from_status AS "fromStatus",
          event.to_status AS "toStatus",
          event.body,
          event.created_at AS "createdAt",
          attachment.file AS attachment,
          CASE
            WHEN event.actor_id = support.partner_id THEN partner.display_name
            ELSE 'Equipe Max'
          END AS "actorName",
          CASE
            WHEN event.actor_id = support.partner_id THEN 'partner'
            ELSE 'operation'
          END AS "actorRole"
        FROM partner_support_events event
        JOIN partner_support_cases support ON support.id = event.case_id
        JOIN users partner ON partner.id = support.partner_id
        LEFT JOIN LATERAL (
          SELECT jsonb_build_object(
            'id', file.id,
            'fileName', file.original_name,
            'contentType', file.content_type,
            'sizeBytes', file.size_bytes,
            'sha256', file.sha256,
            'createdAt', file.created_at
          ) AS file
          FROM partner_support_attachments file
          WHERE file.event_id = event.id
          LIMIT 1
        ) attachment ON true
        WHERE event.case_id = $1
        ORDER BY event.created_at, event.id
      `, [caseId]);
      const dispute = record.rows[0].dispute as { id: string } | null;
      const disputeEvents = dispute
        ? await client.query(`
            SELECT
              event.id,
              event.event_type AS "eventType",
              event.from_status AS "fromStatus",
              event.to_status AS "toStatus",
              event.body,
              event.created_at AS "createdAt",
              CASE
                WHEN event.actor_id = dispute.partner_id THEN partner.display_name
                ELSE COALESCE(actor.display_name, 'Equipe Max')
              END AS "actorName",
              CASE
                WHEN event.actor_id = dispute.partner_id THEN 'partner'
                ELSE 'operation'
              END AS "actorRole"
            FROM partner_support_dispute_events event
            JOIN partner_support_disputes dispute ON dispute.id = event.dispute_id
            JOIN users partner ON partner.id = dispute.partner_id
            LEFT JOIN users actor ON actor.id = event.actor_id
            WHERE event.dispute_id = $1
            ORDER BY event.created_at, event.id
          `, [dispute.id])
        : { rows: [] };
      return {
        ...record.rows[0],
        events: events.rows,
        dispute: dispute ? { ...record.rows[0].dispute, events: disputeEvents.rows } : null,
      };
    });
  }

  async create(actor: Actor, input: CreatePartnerSupportCaseDto, idempotencyKey: string | undefined) {
    this.ensureScope(actor, "partner");
    const subject = this.normalizeText(input.subject, 5, "Informe um assunto com pelo menos 5 caracteres.");
    const body = this.normalizeText(input.body, 10, "Descreva a solicitação com pelo menos 10 caracteres.");
    if (input.topic === "referral" && !input.referralId) {
      throw new BadRequestException("Selecione a indicação relacionada.");
    }
    if (input.topic !== "referral" && input.referralId) {
      throw new BadRequestException("A indicação só pode ser vinculada ao assunto correspondente.");
    }

    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: "/api/v1/partner/support/cases",
        payload: {
          topic: input.topic,
          subject,
          body,
          referralId: input.referralId ?? null,
        },
      }, async () => {
      const active = await client.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM partner_support_cases
        WHERE partner_id = $1 AND status IN ('open', 'in_review')
      `, [actor.id]);
      if ((active.rows[0]?.count ?? 0) >= 5) {
        throw new ConflictException("Conclua uma solicitação em andamento antes de abrir outra.");
      }

      let referralCode: string | null = null;
      if (input.referralId) {
        const referral = await client.query<{ publicCode: string }>(`
          SELECT public_code AS "publicCode"
          FROM partner_referrals
          WHERE id = $1 AND partner_id = $2
        `, [input.referralId, actor.id]);
        if (!referral.rows[0]) throw new NotFoundException("Indicação relacionada não encontrada.");
        referralCode = referral.rows[0].publicCode;
      }

      const caseId = randomUUID();
      const publicCode = `AT-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
      const created = await client.query(`
        INSERT INTO partner_support_cases (
          id, public_code, partner_id, referral_id, topic, priority, status, subject
        ) VALUES ($1, $2, $3, $4, $5, 'normal', 'open', $6)
        RETURNING
          id,
          public_code AS "publicCode",
          topic,
          priority,
          status,
          subject,
          first_response_due_at AS "firstResponseDueAt",
          resolution_due_at AS "resolutionDueAt",
          created_at AS "createdAt"
      `, [caseId, publicCode, actor.id, input.referralId ?? null, input.topic, subject]);
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO partner_support_events (id, case_id, actor_id, event_type, body)
        VALUES ($1, $2, $3, 'message', $4)
      `, [eventId, caseId, actor.id, body]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'partner_support_case.created', 'partner_support_case', $3, $4::jsonb)",
        [actor.id, actor.role, caseId, JSON.stringify({ publicCode, topic: input.topic, referralCode, eventId })],
      );
      await createNotification(client, {
        userId: "00000000-0000-4000-8000-000000000401",
        actorId: actor.id,
        type: "case_opened",
        title: `Novo atendimento · ${publicCode}`,
        body: subject,
        entityType: "partner_support_case",
        entityId: caseId,
      });
      return created.rows[0];
      });
    });
  }

  async addMessage(
    actor: Actor,
    caseId: string,
    rawBody: string,
    scope: "partner" | "operation",
    idempotencyKey: string | undefined,
  ) {
    this.ensureScope(actor, scope);
    const body = this.normalizeText(rawBody, 3, "Escreva uma mensagem com pelo menos 3 caracteres.");
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/${scope}/support/cases/${caseId}/messages`,
        payload: { body },
      }, async () => {
      const current = await client.query<{
        id: string;
        partnerId: string;
        status: "open" | "in_review" | "resolved";
        publicCode: string;
        subject: string;
      }>(`
        SELECT
          id,
          partner_id AS "partnerId",
          status,
          public_code AS "publicCode",
          subject
        FROM partner_support_cases
        WHERE id = $1
      `, [caseId]);
      if (!current.rows[0]) throw new NotFoundException("Solicitação de atendimento não encontrada.");
      if (current.rows[0].status === "resolved") {
        throw new ConflictException("Solicitações resolvidas não recebem novas mensagens.");
      }

      const eventId = randomUUID();
      const event = await client.query(`
        INSERT INTO partner_support_events (id, case_id, actor_id, event_type, body)
        VALUES ($1, $2, $3, 'message', $4)
        RETURNING id, event_type AS "eventType", body, created_at AS "createdAt"
      `, [eventId, caseId, actor.id, body]);
      if (scope === "operation") {
        await client.query(`
          UPDATE partner_support_cases
          SET
            first_responded_at = COALESCE(first_responded_at, now()),
            updated_at = now()
          WHERE id = $1
        `, [caseId]);
      }
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'partner_support_case.message_sent', 'partner_support_case', $3, $4::jsonb)",
        [actor.id, actor.role, caseId, JSON.stringify({ publicCode: current.rows[0].publicCode, eventId })],
      );
      const recipientId = scope === "partner"
        ? "00000000-0000-4000-8000-000000000401"
        : current.rows[0].partnerId;
      await createNotification(client, {
        userId: recipientId,
        actorId: actor.id,
        type: "support_message",
        title: `Nova mensagem · ${current.rows[0].publicCode}`,
        body: body.slice(0, 500),
        entityType: "partner_support_case",
        entityId: caseId,
      });
      return event.rows[0];
      });
    });
  }

  async addMessageWithAttachment(
    actor: Actor,
    caseId: string,
    rawBody: string,
    originalName: string,
    contentType: string,
    bytes: Buffer,
    scope: "partner" | "operation",
    idempotencyKey: string | undefined,
  ) {
    this.ensureScope(actor, scope);
    const caption = rawBody.trim();
    if (caption.length > 0 && caption.length < 3) {
      throw new BadRequestException("Escreva ao menos 3 caracteres ou envie o arquivo sem legenda.");
    }
    if (caption.length > 2000) {
      throw new BadRequestException("A mensagem deve ter no máximo 2.000 caracteres.");
    }
    const fileName = validatePartnerSupportAttachment(originalName, contentType, bytes);
    const body = caption || `Arquivo anexado: ${fileName}`;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const route = `/api/v1/${scope}/support/cases/${caseId}/attachments`;
    let objectKey: string | null = null;
    try {
      return await this.database.withActor(actor, async (client) => {
        return this.idempotency.execute(client, actor, {
          key: idempotencyKey,
          method: "POST",
          route,
          payload: { body: caption, fileName, contentType, sizeBytes: bytes.length, sha256 },
        }, async () => {
        const current = await client.query<{
          partnerId: string;
          status: "open" | "in_review" | "resolved";
          publicCode: string;
        }>(`
          SELECT
            partner_id AS "partnerId",
            status,
            public_code AS "publicCode"
          FROM partner_support_cases
          WHERE id = $1
        `, [caseId]);
        if (!current.rows[0]) throw new NotFoundException("Solicitação de atendimento não encontrada.");
        if (current.rows[0].status === "resolved") {
          throw new ConflictException("Solicitações resolvidas não recebem novos anexos.");
        }

        const eventId = idempotencyDerivedUuid([
          actor.role,
          actor.id,
          route,
          idempotencyKey ?? "",
          "event",
        ]);
        const attachmentId = idempotencyDerivedUuid([
          actor.role,
          actor.id,
          route,
          idempotencyKey ?? "",
          "attachment",
        ]);
        objectKey = `partner-support/${caseId}/events/${eventId}/attachments/${attachmentId}`;
        await this.storage.put(objectKey, bytes, contentType, sha256);
        const event = await client.query(`
          INSERT INTO partner_support_events (id, case_id, actor_id, event_type, body)
          VALUES ($1, $2, $3, 'message', $4)
          RETURNING id, event_type AS "eventType", body, created_at AS "createdAt"
        `, [eventId, caseId, actor.id, body]);
        const attachment = await client.query(`
          INSERT INTO partner_support_attachments (
            id, event_id, case_id, uploader_id, object_key, original_name,
            content_type, size_bytes, sha256
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING
            id,
            original_name AS "fileName",
            content_type AS "contentType",
            size_bytes AS "sizeBytes",
            sha256,
            created_at AS "createdAt"
        `, [
          attachmentId,
          eventId,
          caseId,
          actor.id,
          objectKey,
          fileName,
          contentType,
          bytes.length,
          sha256,
        ]);
        if (scope === "operation") {
          await client.query(`
            UPDATE partner_support_cases
            SET
              first_responded_at = COALESCE(first_responded_at, now()),
              updated_at = now()
            WHERE id = $1
          `, [caseId]);
        }
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'partner_support_case.attachment_sent', 'partner_support_attachment', $3, $4::jsonb)",
          [actor.id, actor.role, attachmentId, JSON.stringify({
            caseId,
            eventId,
            publicCode: current.rows[0].publicCode,
            contentType,
            sizeBytes: bytes.length,
            sha256,
          })],
        );
        const recipientId = scope === "partner"
          ? "00000000-0000-4000-8000-000000000401"
          : current.rows[0].partnerId;
        await createNotification(client, {
          userId: recipientId,
          actorId: actor.id,
          type: "support_message",
          title: `Novo anexo · ${current.rows[0].publicCode}`,
          body: caption ? caption.slice(0, 500) : `Arquivo privado: ${fileName}`,
          entityType: "partner_support_case",
          entityId: caseId,
        });
        return { ...event.rows[0], attachment: attachment.rows[0] };
        });
      });
    } catch (error) {
      if (objectKey) await this.storage.remove(objectKey);
      throw error;
    }
  }

  async downloadAttachment(
    actor: Actor,
    attachmentId: string,
    scope: "partner" | "operation",
  ) {
    this.ensureScope(actor, scope);
    const record = await this.database.withActor(actor, async (client) => {
      const result = await client.query<{
        caseId: string;
        eventId: string;
        objectKey: string;
        originalName: string;
        contentType: string;
        sizeBytes: number;
        sha256: string;
      }>(`
        SELECT
          attachment.case_id AS "caseId",
          attachment.event_id AS "eventId",
          attachment.object_key AS "objectKey",
          attachment.original_name AS "originalName",
          attachment.content_type AS "contentType",
          attachment.size_bytes AS "sizeBytes",
          attachment.sha256
        FROM partner_support_attachments attachment
        WHERE attachment.id = $1
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
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'partner_support_case.attachment_downloaded', 'partner_support_attachment', $3, $4::jsonb)",
        [actor.id, actor.role, attachmentId, JSON.stringify({
          caseId: record.caseId,
          eventId: record.eventId,
          contentType: record.contentType,
          sizeBytes: record.sizeBytes,
          sha256: record.sha256,
        })],
      );
    });
    return {
      originalName: record.originalName,
      contentType: record.contentType,
      bytes,
    };
  }

  async triage(
    actor: Actor,
    caseId: string,
    priority: "normal" | "high",
    assigneeId: string,
    rawNote: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureScope(actor, "operation");
    const note = this.normalizeText(rawNote, 10, "Registre uma justificativa com pelo menos 10 caracteres.");
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/support/cases/${caseId}/triage`,
        payload: { priority, assigneeId, note },
      }, async () => {
      const current = await client.query<{
        status: "open" | "in_review" | "resolved";
        priority: "normal" | "high";
        assignedToId: string | null;
        assignedToName: string | null;
        partnerId: string;
        publicCode: string;
      }>(`
        SELECT
          support.status,
          support.priority,
          support.assigned_to AS "assignedToId",
          assignee.display_name AS "assignedToName",
          support.partner_id AS "partnerId",
          support.public_code AS "publicCode"
        FROM partner_support_cases support
        LEFT JOIN users assignee ON assignee.id = support.assigned_to
        WHERE support.id = $1
        FOR UPDATE OF support
      `, [caseId]);
      if (!current.rows[0]) throw new NotFoundException("Solicitação de atendimento não encontrada.");
      if (current.rows[0].status === "resolved") {
        throw new ConflictException("Solicitações resolvidas não podem ser reclassificadas.");
      }
      if (current.rows[0].priority === "high" && priority === "normal") {
        throw new ConflictException("Uma prioridade alta não pode ser reduzida durante o atendimento.");
      }

      const assignee = await client.query<{ id: string; displayName: string }>(`
        SELECT id, display_name AS "displayName"
        FROM users
        WHERE id = $1 AND role = 'operation'
      `, [assigneeId]);
      if (!assignee.rows[0]) throw new NotFoundException("Responsável operacional não encontrado.");
      if (current.rows[0].priority === priority && current.rows[0].assignedToId === assigneeId) {
        throw new ConflictException("A prioridade e o responsável já estão definidos desta forma.");
      }

      const updated = await client.query(`
        UPDATE partner_support_cases
        SET
          priority = $2,
          assigned_to = $3,
          first_response_due_at = CASE
            WHEN first_responded_at IS NOT NULL THEN first_response_due_at
            ELSE created_at + CASE
              WHEN $2 = 'high' THEN interval '1 hour'
              ELSE interval '4 hours'
            END
          END,
          resolution_due_at = created_at + CASE
            WHEN $2 = 'high' THEN interval '8 hours'
            ELSE interval '48 hours'
          END,
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          public_code AS "publicCode",
          priority,
          assigned_to AS "assignedToId",
          first_response_due_at AS "firstResponseDueAt",
          resolution_due_at AS "resolutionDueAt",
          updated_at AS "updatedAt"
      `, [caseId, priority, assigneeId]);
      const priorityLabel = priority === "high" ? "Alta" : "Normal";
      const previousPriorityLabel = current.rows[0].priority === "high" ? "Alta" : "Normal";
      const eventBody = [
        `Prioridade ${previousPriorityLabel} → ${priorityLabel}.`,
        `Responsável ${current.rows[0].assignedToName ?? "não atribuído"} → ${assignee.rows[0].displayName}.`,
        note,
      ].join(" ");
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO partner_support_events (id, case_id, actor_id, event_type, body)
        VALUES ($1, $2, $3, 'triage_changed', $4)
      `, [eventId, caseId, actor.id, eventBody]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'partner_support_case.triaged', 'partner_support_case', $3, $4::jsonb)",
        [actor.id, actor.role, caseId, JSON.stringify({
          publicCode: current.rows[0].publicCode,
          fromPriority: current.rows[0].priority,
          toPriority: priority,
          fromAssigneeId: current.rows[0].assignedToId,
          toAssigneeId: assigneeId,
          eventId,
        })],
      );
      await createNotification(client, {
        userId: current.rows[0].partnerId,
        actorId: actor.id,
        type: "case_updated",
        title: `Triagem atualizada · ${current.rows[0].publicCode}`,
        body: eventBody.slice(0, 500),
        entityType: "partner_support_case",
        entityId: caseId,
      });
      return updated.rows[0];
      });
    });
  }

  async changeStatus(
    actor: Actor,
    caseId: string,
    status: "in_review" | "resolved",
    rawNote: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureScope(actor, "operation");
    const note = this.normalizeText(rawNote, 10, "Registre uma justificativa com pelo menos 10 caracteres.");
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/support/cases/${caseId}/transitions`,
        payload: { status, note },
      }, async () => {
      const current = await client.query<{
        status: "open" | "in_review" | "resolved";
        partnerId: string;
        publicCode: string;
      }>(`
        SELECT
          status,
          partner_id AS "partnerId",
          public_code AS "publicCode"
        FROM partner_support_cases
        WHERE id = $1
        FOR UPDATE
      `, [caseId]);
      if (!current.rows[0]) throw new NotFoundException("Solicitação de atendimento não encontrada.");
      if (current.rows[0].status === status) throw new ConflictException("A solicitação já está neste estado.");
      if (current.rows[0].status === "resolved") throw new ConflictException("A solicitação já foi resolvida.");
      if (status === "in_review" && current.rows[0].status !== "open") {
        throw new ConflictException("Somente solicitações abertas podem entrar em análise.");
      }
      if (status === "resolved" && current.rows[0].status !== "in_review") {
        throw new ConflictException("Assuma a análise antes de resolver a solicitação.");
      }

      const updated = await client.query(`
        UPDATE partner_support_cases
        SET
          status = $2,
          assigned_to = COALESCE(assigned_to, $3),
          first_responded_at = COALESCE(first_responded_at, now()),
          resolution = CASE WHEN $2 = 'resolved' THEN $4 ELSE NULL END,
          resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE NULL END,
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          public_code AS "publicCode",
          status,
          resolution,
          resolved_at AS "resolvedAt",
          updated_at AS "updatedAt"
      `, [caseId, status, actor.id, note]);
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO partner_support_events (
          id, case_id, actor_id, event_type, from_status, to_status, body
        ) VALUES ($1, $2, $3, 'status_changed', $4, $5, $6)
      `, [eventId, caseId, actor.id, current.rows[0].status, status, note]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'partner_support_case.status_changed', 'partner_support_case', $3, $4::jsonb)",
        [actor.id, actor.role, caseId, JSON.stringify({
          publicCode: current.rows[0].publicCode,
          from: current.rows[0].status,
          to: status,
          eventId,
        })],
      );
      await createNotification(client, {
        userId: current.rows[0].partnerId,
        actorId: actor.id,
        type: "case_updated",
        title: status === "resolved"
          ? `Atendimento resolvido · ${current.rows[0].publicCode}`
          : `Atendimento em análise · ${current.rows[0].publicCode}`,
        body: note.slice(0, 500),
        entityType: "partner_support_case",
        entityId: caseId,
      });
      return updated.rows[0];
      });
    });
  }

  async createDispute(
    actor: Actor,
    caseId: string,
    reason:
      | "resolution_incomplete"
      | "evidence_not_considered"
      | "commercial_divergence"
      | "other",
    rawStatement: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureScope(actor, "partner");
    const statement = this.normalizeText(
      rawStatement,
      20,
      "Descreva a contestação com pelo menos 20 caracteres.",
    );
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/partner/support/cases/${caseId}/disputes`,
        payload: { reason, statement },
      }, async () => {
        const supportCase = await client.query<{
          id: string;
          publicCode: string;
          status: "open" | "in_review" | "resolved";
        }>(`
          SELECT id, public_code AS "publicCode", status
          FROM partner_support_cases
          WHERE id = $1
        `, [caseId]);
        if (!supportCase.rows[0]) {
          throw new NotFoundException("Solicitação de atendimento não encontrada.");
        }
        if (supportCase.rows[0].status !== "resolved") {
          throw new ConflictException("A contestação só pode ser aberta após a resolução do atendimento.");
        }

        const existing = await client.query(`
          SELECT id
          FROM partner_support_disputes
          WHERE case_id = $1
        `, [caseId]);
        if (existing.rows[0]) {
          throw new ConflictException("Este atendimento já possui uma contestação formal.");
        }

        const disputeId = randomUUID();
        const publicCode = `DP-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
        const created = await client.query(`
          INSERT INTO partner_support_disputes (
            id, public_code, case_id, partner_id, reason, statement
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (case_id) DO NOTHING
          RETURNING
            id,
            public_code AS "publicCode",
            reason,
            statement,
            status,
            opened_at AS "openedAt",
            updated_at AS "updatedAt"
        `, [disputeId, publicCode, caseId, actor.id, reason, statement]);
        if (!created.rows[0]) {
          throw new ConflictException("Este atendimento já possui uma contestação formal.");
        }
        const eventId = randomUUID();
        await client.query(`
          INSERT INTO partner_support_dispute_events (
            id, dispute_id, actor_id, event_type, from_status, to_status, body
          ) VALUES ($1, $2, $3, 'opened', NULL, 'open', $4)
        `, [eventId, disputeId, actor.id, statement]);
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'partner_support_dispute.created', 'partner_support_dispute', $3, $4::jsonb)",
          [actor.id, actor.role, disputeId, JSON.stringify({
            publicCode,
            caseId,
            supportCaseCode: supportCase.rows[0].publicCode,
            reason,
            eventId,
          })],
        );
        await createNotification(client, {
          userId: "00000000-0000-4000-8000-000000000401",
          actorId: actor.id,
          type: "case_opened",
          title: `Nova contestação · ${publicCode}`,
          body: `Atendimento ${supportCase.rows[0].publicCode}: ${statement.slice(0, 400)}`,
          entityType: "partner_support_case",
          entityId: caseId,
        });
        return created.rows[0];
      });
    });
  }

  async changeDisputeStatus(
    actor: Actor,
    caseId: string,
    status: "in_review" | "upheld" | "rejected",
    rawNote: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureScope(actor, "operation");
    const note = this.normalizeText(
      rawNote,
      20,
      "Registre uma justificativa com pelo menos 20 caracteres.",
    );
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/support/cases/${caseId}/disputes/transitions`,
        payload: { status, note },
      }, async () => {
        const current = await client.query<{
          id: string;
          publicCode: string;
          status: "open" | "in_review" | "upheld" | "rejected";
          partnerId: string;
          supportCaseCode: string;
        }>(`
          SELECT
            dispute.id,
            dispute.public_code AS "publicCode",
            dispute.status,
            dispute.partner_id AS "partnerId",
            support.public_code AS "supportCaseCode"
          FROM partner_support_disputes dispute
          JOIN partner_support_cases support ON support.id = dispute.case_id
          WHERE dispute.case_id = $1
          FOR UPDATE OF dispute
        `, [caseId]);
        if (!current.rows[0]) {
          throw new NotFoundException("Contestação formal não encontrada.");
        }
        if (current.rows[0].status === status) {
          throw new ConflictException("A contestação já está neste estado.");
        }
        if (current.rows[0].status === "upheld" || current.rows[0].status === "rejected") {
          throw new ConflictException("A contestação já recebeu uma decisão final.");
        }
        if (status === "in_review" && current.rows[0].status !== "open") {
          throw new ConflictException("Somente contestações abertas podem entrar em análise.");
        }
        if (
          (status === "upheld" || status === "rejected")
          && current.rows[0].status !== "in_review"
        ) {
          throw new ConflictException("Inicie a análise antes de decidir a contestação.");
        }

        const updated = await client.query(`
          UPDATE partner_support_disputes
          SET
            status = $2,
            assigned_to = COALESCE(assigned_to, $3),
            reviewed_at = COALESCE(reviewed_at, now()),
            decision = CASE WHEN $2 IN ('upheld', 'rejected') THEN $4 ELSE NULL END,
            decided_at = CASE WHEN $2 IN ('upheld', 'rejected') THEN now() ELSE NULL END,
            updated_at = now()
          WHERE id = $1
          RETURNING
            id,
            public_code AS "publicCode",
            reason,
            statement,
            status,
            assigned_to AS "assignedToId",
            decision,
            opened_at AS "openedAt",
            reviewed_at AS "reviewedAt",
            decided_at AS "decidedAt",
            updated_at AS "updatedAt"
        `, [current.rows[0].id, status, actor.id, note]);
        const eventId = randomUUID();
        await client.query(`
          INSERT INTO partner_support_dispute_events (
            id, dispute_id, actor_id, event_type, from_status, to_status, body
          ) VALUES ($1, $2, $3, 'status_changed', $4, $5, $6)
        `, [eventId, current.rows[0].id, actor.id, current.rows[0].status, status, note]);
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'partner_support_dispute.status_changed', 'partner_support_dispute', $3, $4::jsonb)",
          [actor.id, actor.role, current.rows[0].id, JSON.stringify({
            publicCode: current.rows[0].publicCode,
            caseId,
            supportCaseCode: current.rows[0].supportCaseCode,
            from: current.rows[0].status,
            to: status,
            eventId,
          })],
        );
        await createNotification(client, {
          userId: current.rows[0].partnerId,
          actorId: actor.id,
          type: "case_updated",
          title: status === "in_review"
            ? `Contestação em análise · ${current.rows[0].publicCode}`
            : `Contestação decidida · ${current.rows[0].publicCode}`,
          body: note.slice(0, 500),
          entityType: "partner_support_case",
          entityId: caseId,
        });
        return updated.rows[0];
      });
    });
  }
}
