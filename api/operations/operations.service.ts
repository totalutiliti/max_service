import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { createNotification } from "../notifications/notification-writer.js";

const caseSelect = `
  SELECT
    sc.id,
    sc.public_code AS "publicCode",
    sc.case_type AS "caseType",
    sc.priority,
    sc.status,
    sc.title,
    sc.description,
    sc.resolution,
    sc.created_at AS "createdAt",
    sc.updated_at AS "updatedAt",
    sc.resolved_at AS "resolvedAt",
    r.public_code AS "requestCode",
    r.title AS "requestTitle",
    bc.reason_code AS "reasonCode",
    bc.prior_status AS "priorStatus",
    opener.display_name AS "openedByName",
    opener.role AS "openedByRole",
    assignee.display_name AS "assignedToName",
    (SELECT count(*)::int FROM support_case_events event WHERE event.case_id = sc.id) AS "eventCount"
  FROM support_cases sc
  JOIN bookings b ON b.id = sc.booking_id
  JOIN service_requests r ON r.id = b.request_id
  JOIN booking_cancellations bc ON bc.booking_id = b.id
  JOIN users opener ON opener.id = sc.opened_by
  LEFT JOIN users assignee ON assignee.id = sc.assigned_to
`;

const referralSelect = `
  SELECT
    referral.id,
    referral.public_code AS "publicCode",
    referral.professional_name AS "professionalName",
    referral.email,
    referral.status,
    referral.source,
    referral.consent_at AS "consentAt",
    referral.privacy_notice_version AS "privacyNoticeVersion",
    referral.created_at AS "createdAt",
    referral.activated_at AS "activatedAt",
    partner.display_name AS "partnerName",
    partner.public_code AS "partnerCode",
    category.name AS "categoryName",
    category.icon AS "categoryIcon",
    provider.public_code AS "providerCode",
    reviewer.display_name AS "reviewedByName",
    latest_event.note AS "latestReviewNote",
    latest_event.created_at AS "latestReviewAt",
    (SELECT count(*)::int FROM partner_referral_events event WHERE event.referral_id = referral.id) AS "eventCount"
  FROM partner_referrals referral
  JOIN users partner ON partner.id = referral.partner_id
  JOIN service_categories category ON category.id = referral.service_category_id
  LEFT JOIN users provider ON provider.id = referral.provider_id
  LEFT JOIN LATERAL (
    SELECT event.actor_id, event.note, event.created_at
    FROM partner_referral_events event
    WHERE event.referral_id = referral.id
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1
  ) latest_event ON true
  LEFT JOIN users reviewer ON reviewer.id = latest_event.actor_id
`;

const auditActivityCopy: Record<string, { category: string; title: string; detail: string }> = {
  "service_request.created": { category: "marketplace", title: "Solicitação criada", detail: "Novo pedido registrado no marketplace." },
  "service_request.attachment_uploaded": { category: "marketplace", title: "Imagem do pedido enviada", detail: "Arquivo privado anexado à solicitação." },
  "service_request.attachment_downloaded": { category: "marketplace", title: "Imagem do pedido acessada", detail: "Download privado registrado na auditoria." },
  "proposal.upserted": { category: "marketplace", title: "Proposta registrada", detail: "Oferta do profissional criada ou atualizada." },
  "proposal.accepted": { category: "marketplace", title: "Proposta aceita", detail: "A contratação avançou para agendamento." },
  "message.sent": { category: "service", title: "Mensagem enviada", detail: "Comunicação transacional registrada." },
  "message.attachment_sent": { category: "service", title: "Imagem enviada na conversa", detail: "Anexo privado vinculado à mensagem." },
  "message.attachment_downloaded": { category: "service", title: "Imagem da conversa acessada", detail: "Download privado registrado na auditoria." },
  "booking.status_changed": { category: "service", title: "Atendimento atualizado", detail: "O serviço avançou no ciclo de execução." },
  "booking.cancelled": { category: "operation", title: "Atendimento cancelado", detail: "Cancelamento e abertura de ocorrência registrados." },
  "service_review.created": { category: "service", title: "Avaliação registrada", detail: "Experiência avaliada após a conclusão." },
  "support_case.status_changed": { category: "operation", title: "Ocorrência atualizada", detail: "Mudança de estado justificada pela Operação." },
  "support_case.note_added": { category: "operation", title: "Nota interna adicionada", detail: "Registro append-only incluído na ocorrência." },
  "partner_referral.invited": { category: "growth", title: "Indicação registrada", detail: "Profissional vinculado à rede de um parceiro." },
  "partner_referral.status_changed": { category: "growth", title: "Indicação revisada", detail: "Triagem operacional da indicação atualizada." },
  "provider_verification.status_changed": { category: "operation", title: "Verificação atualizada", detail: "Estado da análise documental alterado." },
  "provider_verification.document_reviewed": { category: "operation", title: "Documento revisado", detail: "Item do checklist conferido pela Operação." },
  "provider_document.uploaded": { category: "operation", title: "Documento privado enviado", detail: "Nova versão recebida para conferência." },
  "provider_document.downloaded": { category: "operation", title: "Documento privado acessado", detail: "Download operacional registrado." },
  "finance.sandbox_settlement": { category: "finance", title: "Liquidação sandbox processada", detail: "Ledger demonstrativo atualizado e conciliado." },
  "finance.sandbox_refund": { category: "finance", title: "Estorno sandbox processado", detail: "Lançamentos inversos registrados no ledger." },
  "service_category.status_changed": { category: "operation", title: "Categoria atualizada", detail: "Disponibilidade do catálogo alterada com justificativa." },
  "service_category.reordered": { category: "operation", title: "Catálogo reordenado", detail: "Prioridade de exibição de uma categoria alterada." },
  "partner_support_case.created": { category: "growth", title: "Atendimento aberto", detail: "Nova solicitação registrada por um parceiro." },
  "partner_support_case.message_sent": { category: "growth", title: "Mensagem de atendimento", detail: "Interação registrada na central do parceiro." },
  "partner_support_case.triaged": { category: "operation", title: "Triagem de atendimento", detail: "Prioridade, responsável e prazos operacionais atualizados com justificativa." },
  "partner_support_case.status_changed": { category: "operation", title: "Atendimento atualizado", detail: "Estado da solicitação do parceiro alterado com justificativa." },
};

const auditEntityPrefix: Record<string, string> = {
  service_request: "SV",
  service_request_attachment: "AN",
  proposal: "PP",
  booking: "AG",
  message: "MS",
  message_attachment: "MA",
  service_review: "AV",
  support_case: "CS",
  partner_referral: "RF",
  provider_verification: "VF",
  provider_document_check: "DC",
  provider_document_file: "DF",
  payment_intent: "PG",
  service_category: "CT",
  partner_support_case: "AT",
};

@Injectable()
export class OperationsService {
  constructor(private readonly database: DatabaseService) {}

  private ensureOperation(actor: Actor) {
    if (actor.role !== "operation") throw new ForbiddenException("Somente a operação pode tratar esta fila.");
  }

  private normalizeNote(note: string) {
    const normalized = note.trim();
    if (normalized.length < 10) throw new BadRequestException("Registre uma justificativa com pelo menos 10 caracteres.");
    return normalized;
  }

  async categories(actor: Actor) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const categories = await client.query(`
        SELECT
          category.id,
          category.slug,
          category.name,
          category.icon,
          category.sort_order AS "sortOrder",
          category.active,
          category.updated_at AS "updatedAt",
          (SELECT count(*)::int FROM service_requests request WHERE request.category_id = category.id) AS "requestCount",
          (
            SELECT count(*)::int
            FROM service_requests request
            WHERE request.category_id = category.id
              AND request.status IN ('open', 'proposals_received', 'booked', 'in_progress')
          ) AS "openRequestCount",
          (SELECT count(*)::int FROM partner_referrals referral WHERE referral.service_category_id = category.id) AS "referralCount",
          (SELECT count(*)::int FROM service_category_events event WHERE event.category_id = category.id) AS "eventCount",
          latest_event.event_type AS "latestEventType",
          latest_event.note AS "latestEventNote",
          latest_event.created_at AS "latestEventAt",
          latest_actor.display_name AS "latestActorName"
        FROM service_categories category
        LEFT JOIN LATERAL (
          SELECT event.actor_id, event.event_type, event.note, event.created_at
          FROM service_category_events event
          WHERE event.category_id = category.id
          ORDER BY event.created_at DESC, event.id DESC
          LIMIT 1
        ) latest_event ON true
        LEFT JOIN users latest_actor ON latest_actor.id = latest_event.actor_id
        ORDER BY category.sort_order, category.name
      `);
      const metrics = await client.query(`
        SELECT
          count(*)::int AS "totalCount",
          count(*) FILTER (WHERE active)::int AS "activeCount",
          count(*) FILTER (WHERE NOT active)::int AS "inactiveCount"
        FROM service_categories
      `);
      return { metrics: metrics.rows[0], categories: categories.rows };
    });
  }

  async manageCategory(
    actor: Actor,
    categoryId: string,
    action: "activate" | "deactivate" | "move_up" | "move_down",
    note: string,
  ) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      const catalog = await client.query<{
        id: string;
        slug: string;
        name: string;
        active: boolean;
        sortOrder: number;
      }>(`
        SELECT id, slug, name, active, sort_order AS "sortOrder"
        FROM service_categories
        ORDER BY sort_order, name
        FOR UPDATE
      `);
      const currentIndex = catalog.rows.findIndex((category) => category.id === categoryId);
      if (currentIndex < 0) throw new NotFoundException("Categoria não encontrada.");
      const current = catalog.rows[currentIndex];

      if (action === "activate" || action === "deactivate") {
        const nextActive = action === "activate";
        if (current.active === nextActive) {
          throw new ConflictException(nextActive ? "A categoria já está ativa." : "A categoria já está desativada.");
        }
        if (!nextActive && catalog.rows.filter((category) => category.active).length <= 1) {
          throw new ConflictException("O catálogo precisa manter ao menos uma categoria ativa.");
        }

        const updated = await client.query(`
          UPDATE service_categories
          SET active = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, slug, name, icon, sort_order AS "sortOrder", active, updated_at AS "updatedAt"
        `, [categoryId, nextActive]);
        const eventId = randomUUID();
        await client.query(`
          INSERT INTO service_category_events (
            id, category_id, actor_id, event_type, from_active, to_active, note
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          eventId,
          categoryId,
          actor.id,
          nextActive ? "activated" : "deactivated",
          current.active,
          nextActive,
          normalizedNote,
        ]);
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'service_category.status_changed', 'service_category', $3, $4::jsonb)",
          [actor.id, actor.role, categoryId, JSON.stringify({
            from: current.active ? "ativa" : "inativa",
            to: nextActive ? "ativa" : "inativa",
            eventId,
          })],
        );
        return updated.rows[0];
      }

      const targetIndex = action === "move_up" ? currentIndex - 1 : currentIndex + 1;
      const target = catalog.rows[targetIndex];
      if (!target) {
        throw new ConflictException(action === "move_up"
          ? "Esta categoria já é a primeira do catálogo."
          : "Esta categoria já é a última do catálogo.");
      }

      await client.query("SET CONSTRAINTS service_categories_sort_order_unique DEFERRED");
      await client.query(
        "UPDATE service_categories SET sort_order = $2, updated_at = now() WHERE id = $1",
        [current.id, target.sortOrder],
      );
      await client.query(
        "UPDATE service_categories SET sort_order = $2, updated_at = now() WHERE id = $1",
        [target.id, current.sortOrder],
      );
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO service_category_events (
          id, category_id, actor_id, event_type, from_sort_order, to_sort_order, note
        ) VALUES ($1, $2, $3, 'reordered', $4, $5, $6)
      `, [eventId, categoryId, actor.id, current.sortOrder, target.sortOrder, normalizedNote]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'service_category.reordered', 'service_category', $3, $4::jsonb)",
        [actor.id, actor.role, categoryId, JSON.stringify({ from: `#${current.sortOrder}`, to: `#${target.sortOrder}`, eventId })],
      );
      const updated = await client.query(`
        SELECT id, slug, name, icon, sort_order AS "sortOrder", active, updated_at AS "updatedAt"
        FROM service_categories
        WHERE id = $1
      `, [categoryId]);
      return updated.rows[0];
    });
  }

  async cases(actor: Actor) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`${caseSelect}
        ORDER BY
          CASE sc.status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END,
          CASE sc.priority WHEN 'high' THEN 0 ELSE 1 END,
          sc.updated_at DESC
      `);
      return result.rows;
    });
  }

  async caseDetail(actor: Actor, caseId: string) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const record = await client.query(`${caseSelect} WHERE sc.id = $1`, [caseId]);
      if (!record.rows[0]) throw new NotFoundException("Chamado não encontrado.");
      const events = await client.query(`
        SELECT
          event.id,
          event.event_type AS "eventType",
          event.from_status AS "fromStatus",
          event.to_status AS "toStatus",
          event.note,
          event.created_at AS "createdAt",
          actor.display_name AS "actorName",
          actor.role AS "actorRole"
        FROM support_case_events event
        JOIN users actor ON actor.id = event.actor_id
        WHERE event.case_id = $1
        ORDER BY event.created_at DESC, event.id DESC
      `, [caseId]);
      return { ...record.rows[0], events: events.rows };
    });
  }

  async changeStatus(actor: Actor, caseId: string, status: "in_review" | "resolved", note: string) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      const current = await client.query<{ id: string; status: "open" | "in_review" | "resolved"; openedBy: string; publicCode: string }>(
        "SELECT id, status, opened_by AS \"openedBy\", public_code AS \"publicCode\" FROM support_cases WHERE id = $1 FOR UPDATE",
        [caseId],
      );
      if (!current.rows[0]) throw new NotFoundException("Chamado não encontrado.");
      const fromStatus = current.rows[0].status;
      if (fromStatus === "resolved") throw new ConflictException("Este chamado já foi resolvido.");
      if (fromStatus === status) throw new ConflictException("O chamado já está neste estado.");
      if (status === "in_review" && fromStatus !== "open") {
        throw new ConflictException("Somente chamados abertos podem entrar em análise.");
      }

      const updated = await client.query(`
        UPDATE support_cases
        SET
          status = $2,
          assigned_to = $3,
          resolution = CASE WHEN $2 = 'resolved' THEN $4 ELSE resolution END,
          resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE resolved_at END,
          updated_at = now()
        WHERE id = $1
        RETURNING id, public_code AS "publicCode", status, priority, assigned_to AS "assignedTo", resolution,
          updated_at AS "updatedAt", resolved_at AS "resolvedAt"
      `, [caseId, status, actor.id, normalizedNote]);

      const eventId = randomUUID();
      await client.query(`
        INSERT INTO support_case_events (id, case_id, actor_id, event_type, from_status, to_status, note)
        VALUES ($1, $2, $3, 'status_changed', $4, $5, $6)
      `, [eventId, caseId, actor.id, fromStatus, status, normalizedNote]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'support_case.status_changed', 'support_case', $3, $4::jsonb)",
        [actor.id, actor.role, caseId, JSON.stringify({ from: fromStatus, to: status, eventId })],
      );
      await createNotification(client, {
        userId: current.rows[0].openedBy,
        actorId: actor.id,
        type: "case_updated",
        title: status === "resolved" ? `Chamado resolvido · ${current.rows[0].publicCode}` : `Chamado em análise · ${current.rows[0].publicCode}`,
        body: normalizedNote,
        entityType: "support_case",
        entityId: caseId,
      });
      return updated.rows[0];
    });
  }

  async addNote(actor: Actor, caseId: string, note: string) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      const current = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM support_cases WHERE id = $1 FOR UPDATE",
        [caseId],
      );
      if (!current.rows[0]) throw new NotFoundException("Chamado não encontrado.");
      if (current.rows[0].status === "resolved") throw new ConflictException("Chamados resolvidos não recebem novas notas.");

      const eventId = randomUUID();
      const event = await client.query(`
        INSERT INTO support_case_events (id, case_id, actor_id, event_type, note)
        VALUES ($1, $2, $3, 'note', $4)
        RETURNING id, event_type AS "eventType", note, created_at AS "createdAt"
      `, [eventId, caseId, actor.id, normalizedNote]);
      await client.query("UPDATE support_cases SET updated_at = now(), assigned_to = COALESCE(assigned_to, $2) WHERE id = $1", [caseId, actor.id]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'support_case.note_added', 'support_case', $3, $4::jsonb)",
        [actor.id, actor.role, caseId, JSON.stringify({ eventId })],
      );
      return event.rows[0];
    });
  }

  async referrals(actor: Actor) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`${referralSelect}
        ORDER BY
          CASE referral.status
            WHEN 'invited' THEN 0
            WHEN 'in_review' THEN 1
            WHEN 'approved' THEN 2
            WHEN 'rejected' THEN 3
            ELSE 4
          END,
          referral.created_at DESC,
          referral.id DESC
      `);
      return result.rows;
    });
  }

  async referralDetail(actor: Actor, referralId: string) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const record = await client.query(`${referralSelect} WHERE referral.id = $1`, [referralId]);
      if (!record.rows[0]) throw new NotFoundException("Indicação não encontrada.");
      const events = await client.query(`
        SELECT
          event.id,
          event.event_type AS "eventType",
          event.from_status AS "fromStatus",
          event.to_status AS "toStatus",
          event.note,
          event.created_at AS "createdAt",
          actor.display_name AS "actorName"
        FROM partner_referral_events event
        JOIN users actor ON actor.id = event.actor_id
        WHERE event.referral_id = $1
        ORDER BY event.created_at DESC, event.id DESC
      `, [referralId]);
      return { ...record.rows[0], events: events.rows };
    });
  }

  async changeReferralStatus(
    actor: Actor,
    referralId: string,
    status: "in_review" | "approved" | "rejected",
    note: string,
  ) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      const current = await client.query<{
        id: string;
        status: "invited" | "in_review" | "approved" | "active" | "rejected";
        partnerId: string;
        publicCode: string;
        professionalName: string;
      }>(`
        SELECT
          id,
          status,
          partner_id AS "partnerId",
          public_code AS "publicCode",
          professional_name AS "professionalName"
        FROM partner_referrals
        WHERE id = $1
        FOR UPDATE
      `, [referralId]);
      if (!current.rows[0]) throw new NotFoundException("Indicação não encontrada.");

      const referral = current.rows[0];
      if (referral.status === status) throw new ConflictException("A indicação já está neste estado.");
      if (referral.status === "active") throw new ConflictException("Profissionais ativos não passam por uma nova triagem.");
      if (referral.status === "approved" || referral.status === "rejected") {
        throw new ConflictException("Esta indicação já possui uma decisão final.");
      }
      if (status === "in_review" && referral.status !== "invited") {
        throw new ConflictException("Somente indicações convidadas podem entrar em análise.");
      }
      if ((status === "approved" || status === "rejected") && referral.status !== "in_review") {
        throw new ConflictException("Inicie a análise antes de registrar a decisão.");
      }

      const eventType = status === "in_review" ? "review_started" : status;
      const eventId = randomUUID();
      const updated = await client.query(`
        UPDATE partner_referrals
        SET status = $2
        WHERE id = $1
        RETURNING id, public_code AS "publicCode", status
      `, [referralId, status]);
      await client.query(`
        INSERT INTO partner_referral_events (
          id, referral_id, actor_id, event_type, from_status, to_status, note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [eventId, referralId, actor.id, eventType, referral.status, status, normalizedNote]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'partner_referral.status_changed', 'partner_referral', $3, $4::jsonb)",
        [actor.id, actor.role, referralId, JSON.stringify({ from: referral.status, to: status, eventId })],
      );

      if (status === "approved" || status === "rejected") {
        await createNotification(client, {
          userId: referral.partnerId,
          actorId: actor.id,
          type: "referral_reviewed",
          title: status === "approved"
            ? `Indicação aprovada · ${referral.publicCode}`
            : `Indicação não aprovada · ${referral.publicCode}`,
          body: normalizedNote.slice(0, 500),
          entityType: "partner_referral",
          entityId: referralId,
        });
      }
      return updated.rows[0];
    });
  }

  async activity(actor: Actor) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const events = await client.query<{
        id: string;
        action: string;
        entityType: string;
        entityId: string;
        actorRole: string;
        actorName: string;
        publicCode: string | null;
        fromStatus: string | null;
        toStatus: string | null;
        createdAt: string;
      }>(`
        SELECT
          audit.id::text,
          audit.action,
          audit.entity_type AS "entityType",
          audit.entity_id::text AS "entityId",
          audit.actor_role AS "actorRole",
          actor.display_name AS "actorName",
          NULLIF(audit.payload ->> 'publicCode', '') AS "publicCode",
          NULLIF(audit.payload ->> 'from', '') AS "fromStatus",
          NULLIF(audit.payload ->> 'to', '') AS "toStatus",
          audit.created_at AS "createdAt"
        FROM audit_events audit
        JOIN users actor ON actor.id = audit.actor_id
        ORDER BY audit.created_at DESC, audit.id DESC
        LIMIT 150
      `);
      const metrics = await client.query<{
        totalCount: number;
        lastThirtyDaysCount: number;
        criticalCount: number;
        actorCount: number;
      }>(`
        SELECT
          count(*)::int AS "totalCount",
          count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS "lastThirtyDaysCount",
          count(*) FILTER (
            WHERE created_at >= now() - interval '30 days'
              AND (
                action IN (
                  'proposal.accepted',
                  'booking.cancelled',
                  'support_case.status_changed',
                  'partner_referral.status_changed',
                  'provider_verification.status_changed',
                  'provider_verification.document_reviewed',
                  'service_category.status_changed',
                  'service_category.reordered',
                  'partner_support_case.triaged',
                  'partner_support_case.status_changed'
                )
                OR action LIKE 'finance.sandbox_%'
              )
          )::int AS "criticalCount",
          count(DISTINCT actor_id)::int AS "actorCount"
        FROM audit_events
      `);

      return {
        metrics: metrics.rows[0],
        events: events.rows.map((event) => {
          const copy = auditActivityCopy[event.action] ?? {
            category: "operation",
            title: "Evento auditado",
            detail: "Ação registrada pelo sistema.",
          };
          const transition = event.fromStatus && event.toStatus
            ? `${event.fromStatus} → ${event.toStatus}`
            : null;
          const prefix = auditEntityPrefix[event.entityType] ?? "EV";
          return {
            id: event.id,
            action: event.action,
            category: copy.category,
            title: copy.title,
            detail: transition ? `${copy.detail} ${transition}.` : copy.detail,
            reference: event.publicCode ?? `${prefix}-${event.entityId.replaceAll("-", "").slice(0, 6).toUpperCase()}`,
            entityType: event.entityType,
            actorRole: event.actorRole,
            actorName: event.actorName,
            createdAt: event.createdAt,
          };
        }),
      };
    });
  }
}
