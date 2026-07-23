import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { createNotification } from "../notifications/notification-writer.js";
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
    support.created_at AS "createdAt",
    support.updated_at AS "updatedAt",
    support.resolved_at AS "resolvedAt",
    partner.display_name AS "partnerName",
    partner.public_code AS "partnerCode",
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
`;

@Injectable()
export class PartnerSupportService {
  constructor(private readonly database: DatabaseService) {}

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
          )::int AS "waitingOperationCount"
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
      return { cases: cases.rows, metrics: metrics.rows[0], referrals: referrals.rows };
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
        WHERE event.case_id = $1
        ORDER BY event.created_at, event.id
      `, [caseId]);
      return { ...record.rows[0], events: events.rows };
    });
  }

  async create(actor: Actor, input: CreatePartnerSupportCaseDto) {
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
        RETURNING id, public_code AS "publicCode", topic, priority, status, subject, created_at AS "createdAt"
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
  }

  async addMessage(actor: Actor, caseId: string, rawBody: string, scope: "partner" | "operation") {
    this.ensureScope(actor, scope);
    const body = this.normalizeText(rawBody, 3, "Escreva uma mensagem com pelo menos 3 caracteres.");
    return this.database.withActor(actor, async (client) => {
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
  }

  async changeStatus(
    actor: Actor,
    caseId: string,
    status: "in_review" | "resolved",
    rawNote: string,
  ) {
    this.ensureScope(actor, "operation");
    const note = this.normalizeText(rawNote, 10, "Registre uma justificativa com pelo menos 10 caracteres.");
    return this.database.withActor(actor, async (client) => {
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
          assigned_to = $3,
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
  }
}
