import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import { createNotification } from "../notifications/notification-writer.js";
import type { UpdateOperationReadinessGateDto, UpdateOperationReportGoalsDto } from "./operations.dto.js";
import {
  normalizeReportDays,
  percentage,
  percentagePointChange,
  relativeChange,
} from "./reporting.js";

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
  "service_region.status_changed": { category: "operation", title: "Região do piloto atualizada", detail: "Disponibilidade territorial alterada com justificativa." },
  "service_region_neighborhood.status_changed": { category: "operation", title: "Bairro do piloto atualizado", detail: "Cobertura de um bairro alterada com justificativa." },
  "provider_matching.updated": { category: "operation", title: "Matching profissional atualizado", detail: "Disponibilidade e limites de oportunidades foram versionados." },
  "partner_support_case.created": { category: "growth", title: "Atendimento aberto", detail: "Nova solicitação registrada por um parceiro." },
  "partner_support_case.message_sent": { category: "growth", title: "Mensagem de atendimento", detail: "Interação registrada na central do parceiro." },
  "partner_support_case.attachment_sent": { category: "growth", title: "Anexo de atendimento enviado", detail: "Arquivo privado vinculado ao histórico do atendimento." },
  "partner_support_case.attachment_downloaded": { category: "operation", title: "Anexo de atendimento acessado", detail: "Download privado registrado na auditoria." },
  "partner_support_case.triaged": { category: "operation", title: "Triagem de atendimento", detail: "Prioridade, responsável e prazos operacionais atualizados com justificativa." },
  "partner_support_case.status_changed": { category: "operation", title: "Atendimento atualizado", detail: "Estado da solicitação do parceiro alterado com justificativa." },
  "partner_support_dispute.created": { category: "growth", title: "Contestação formal aberta", detail: "Parceiro contestou a resolução de um atendimento." },
  "partner_support_dispute.status_changed": { category: "operation", title: "Contestação atualizada", detail: "Análise ou decisão formal registrada pela Operação." },
  "marketing_campaign.created": { category: "growth", title: "Campanha criada", detail: "Nova regra promocional publicada pela Operação." },
  "marketing_campaign.status_changed": { category: "growth", title: "Campanha atualizada", detail: "Disponibilidade da campanha alterada com justificativa." },
  "marketing_campaign.reserved": { category: "growth", title: "Cupom reservado", detail: "Benefício promocional vinculado a um pedido." },
  "operation_report.generated": { category: "operation", title: "Relatório consolidado", detail: "Indicadores agregados consultados pela Operação." },
  "operation_report_goals.updated": { category: "operation", title: "Metas do relatório atualizadas", detail: "Limites operacionais alterados com justificativa." },
  "onboarding.completed": { category: "operation", title: "Onboarding concluído", detail: "Perfil, termos e consentimentos iniciais registrados." },
  "onboarding.updated": { category: "operation", title: "Onboarding atualizado", detail: "Nova versão do perfil e das preferências registrada." },
  "notification.preferences_updated": { category: "operation", title: "Preferências de avisos atualizadas", detail: "Assuntos e janela silenciosa do destinatário foram versionados." },
  "notification.push_subscribed": { category: "operation", title: "Aparelho habilitado para avisos", detail: "Nova assinatura Web Push registrada sem expor o endpoint." },
  "notification.push_unsubscribed": { category: "operation", title: "Aparelho removido dos avisos", detail: "Assinatura Web Push revogada pelo próprio destinatário." },
  "operation_readiness.updated": { category: "operation", title: "Gate de prontidão atualizado", detail: "Evidência e estado do gate de produção foram versionados." },
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
  service_region: "RG",
  service_region_neighborhood: "BR",
  provider_matching: "MT",
  partner_support_case: "AT",
  partner_support_attachment: "AA",
  partner_support_dispute: "DP",
  marketing_campaign: "CP",
  campaign_reservation: "CR",
  operation_report: "RP",
  operation_report_goal: "MG",
  onboarding_profile: "ON",
  notification_preferences: "NP",
  push_subscription: "PS",
  operation_readiness_gate: "GT",
};

@Injectable()
export class OperationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private ensureOperation(actor: Actor) {
    if (actor.role !== "operation") throw new ForbiddenException("Somente a operação pode tratar esta fila.");
  }

  private normalizeNote(note: string) {
    const normalized = note.trim();
    if (normalized.length < 10) throw new BadRequestException("Registre uma justificativa com pelo menos 10 caracteres.");
    return normalized;
  }

  async readiness(actor: Actor) {
    this.ensureOperation(actor);
    return this.database.withActor(
      actor,
      (client) => this.readinessWithinTransaction(client),
    );
  }

  async updateReadinessGate(
    actor: Actor,
    gateKey: string,
    input: UpdateOperationReadinessGateDto,
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const ownerLabel = input.ownerLabel.trim();
    const evidence = input.evidence.trim();
    const note = this.normalizeNote(input.note);
    if (ownerLabel.length < 3) {
      throw new BadRequestException("Informe o responsável pelo gate.");
    }
    if (input.status === "evidence_ready" && evidence.length < 20) {
      throw new BadRequestException("Evidência pronta exige uma descrição com pelo menos 20 caracteres.");
    }

    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/readiness/${gateKey}`,
        payload: {
          status: input.status,
          ownerLabel,
          evidence,
          expectedVersion: input.expectedVersion,
          note,
        },
      }, async () => {
      const current = await client.query<{
        gateKey: string;
        status: UpdateOperationReadinessGateDto["status"];
        ownerLabel: string;
        evidence: string;
        version: number;
      }>(`
        SELECT
          gate_key AS "gateKey",
          status,
          owner_label AS "ownerLabel",
          evidence,
          version
        FROM operation_readiness_gates
        WHERE gate_key = $1
        FOR UPDATE
      `, [gateKey]);
      const gate = current.rows[0];
      if (!gate) throw new NotFoundException("Gate de prontidão não encontrado.");
      if (gate.version !== input.expectedVersion) {
        throw new ConflictException("Este gate foi atualizado por outra pessoa. Recarregue antes de salvar.");
      }
      if (
        gate.status === input.status
        && gate.ownerLabel === ownerLabel
        && gate.evidence === evidence
      ) {
        throw new BadRequestException("Altere o estado, o responsável ou a evidência antes de salvar.");
      }

      const version = gate.version + 1;
      const eventId = randomUUID();
      await client.query(`
        UPDATE operation_readiness_gates
        SET
          status = $2,
          owner_label = $3,
          evidence = $4,
          version = $5,
          updated_by = $6,
          reviewed_at = now(),
          updated_at = now()
        WHERE gate_key = $1
      `, [gateKey, input.status, ownerLabel, evidence, version, actor.id]);
      await client.query(`
        INSERT INTO operation_readiness_gate_events (
          id,
          gate_key,
          actor_id,
          from_status,
          to_status,
          gate_version,
          note,
          snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `, [
        eventId,
        gateKey,
        actor.id,
        gate.status,
        input.status,
        version,
        note,
        JSON.stringify({
          ownerLabel,
          evidence,
          previousOwnerLabel: gate.ownerLabel,
          previousEvidence: gate.evidence,
        }),
      ]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'operation_readiness.updated', 'operation_readiness_gate', $3, $4::jsonb)",
        [actor.id, actor.role, eventId, JSON.stringify({
          gateKey,
          fromStatus: gate.status,
          toStatus: input.status,
          version,
        })],
      );
      return this.readinessWithinTransaction(client);
      });
    });
  }

  private async readinessWithinTransaction(client: PoolClient) {
    const gates = await client.query<{
      gateKey: string;
      area: "business" | "legal" | "security" | "technology" | "finance" | "operation";
      title: string;
      description: string;
      ownerLabel: string;
      status: "blocked" | "in_progress" | "evidence_ready";
      externalApprovalRequired: boolean;
      evidence: string;
      version: number;
      reviewedAt: Date | null;
      updatedAt: Date;
      updatedByName: string | null;
    }>(`
      SELECT
        gate.gate_key AS "gateKey",
        gate.area,
        gate.title,
        gate.description,
        gate.owner_label AS "ownerLabel",
        gate.status,
        gate.external_approval_required AS "externalApprovalRequired",
        gate.evidence,
        gate.version,
        gate.reviewed_at AS "reviewedAt",
        gate.updated_at AS "updatedAt",
        updater.display_name AS "updatedByName"
      FROM operation_readiness_gates gate
      LEFT JOIN users updater ON updater.id = gate.updated_by
      ORDER BY
        CASE gate.status
          WHEN 'blocked' THEN 0
          WHEN 'in_progress' THEN 1
          ELSE 2
        END,
        gate.external_approval_required DESC,
        gate.area,
        gate.gate_key
    `);
    const history = await client.query<{
      id: string;
      gateKey: string;
      gateTitle: string;
      fromStatus: "blocked" | "in_progress" | "evidence_ready";
      toStatus: "blocked" | "in_progress" | "evidence_ready";
      gateVersion: number;
      note: string;
      createdAt: Date;
      actorName: string;
    }>(`
      SELECT
        event.id,
        event.gate_key AS "gateKey",
        gate.title AS "gateTitle",
        event.from_status AS "fromStatus",
        event.to_status AS "toStatus",
        event.gate_version AS "gateVersion",
        event.note,
        event.created_at AS "createdAt",
        actor.display_name AS "actorName"
      FROM operation_readiness_gate_events event
      JOIN operation_readiness_gates gate ON gate.gate_key = event.gate_key
      JOIN users actor ON actor.id = event.actor_id
      ORDER BY event.created_at DESC, event.id DESC
      LIMIT 20
    `);
    const blockedCount = gates.rows.filter((gate) => gate.status === "blocked").length;
    const inProgressCount = gates.rows.filter((gate) => gate.status === "in_progress").length;
    const evidenceReadyCount = gates.rows.filter((gate) => gate.status === "evidence_ready").length;
    const externalApprovalCount = gates.rows.filter((gate) => gate.externalApprovalRequired).length;
    return {
      policy: {
        version: "PRODUCTION-GATE-2026-01",
        productionAuthorized: false,
        rule: "Evidência pronta não autoriza produção; a decisão final exige aprovação técnica, jurídica, financeira e operacional.",
      },
      metrics: {
        totalCount: gates.rows.length,
        blockedCount,
        inProgressCount,
        evidenceReadyCount,
        externalApprovalCount,
        evidenceCoverageBps: gates.rows.length === 0
          ? 0
          : Math.round((evidenceReadyCount / gates.rows.length) * 10_000),
      },
      gates: gates.rows,
      history: history.rows,
    };
  }

  async matching(actor: Actor) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<{
        providerId: string;
        providerCode: string;
        providerName: string;
        primaryCategoryId: string | null;
        categoryName: string | null;
        categoryIcon: string | null;
        categoryActive: boolean | null;
        availabilityStatus: "available_now" | "scheduled" | "paused" | null;
        acceptsUrgent: boolean | null;
        activeProposalLimit: number | null;
        activeJobLimit: number | null;
        version: number | null;
        updatedAt: Date | null;
        verificationStatus: "submitted" | "in_review" | "changes_requested" | "approved" | null;
        activeRegionCount: number;
        activeProposalCount: number;
        activeJobCount: number;
      }>(`
        SELECT
          provider.id AS "providerId",
          provider.public_code AS "providerCode",
          provider.display_name AS "providerName",
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
            WHERE coverage.provider_id = provider.id
              AND coverage.active = true
              AND region.active = true
          ) AS "activeRegionCount",
          (
            SELECT count(*)::int
            FROM proposals proposal
            WHERE proposal.provider_id = provider.id
              AND proposal.status = 'sent'
          ) AS "activeProposalCount",
          (
            SELECT count(*)::int
            FROM bookings booking
            WHERE booking.provider_id = provider.id
              AND booking.status IN ('scheduled', 'in_progress')
          ) AS "activeJobCount"
        FROM users provider
        LEFT JOIN provider_matching_profiles matching ON matching.provider_id = provider.id
        LEFT JOIN service_categories category ON category.id = matching.primary_category_id
        LEFT JOIN provider_verifications verification ON verification.provider_id = provider.id
        WHERE provider.role = 'provider'
        ORDER BY provider.display_name
      `);
      const providers = result.rows.map((provider) => {
        const blockers: Array<{ code: string; label: string }> = [];
        if (!provider.primaryCategoryId) blockers.push({ code: "missing_profile", label: "Matching não configurado" });
        if (provider.verificationStatus !== "approved") blockers.push({ code: "verification", label: "Verificação pendente" });
        if (provider.activeRegionCount === 0) blockers.push({ code: "coverage", label: "Sem região ativa" });
        if (provider.availabilityStatus === "paused") blockers.push({ code: "paused", label: "Oportunidades pausadas" });
        if (provider.categoryActive === false) blockers.push({ code: "category", label: "Categoria indisponível" });
        if (
          provider.activeProposalLimit !== null
          && provider.activeProposalCount >= provider.activeProposalLimit
        ) blockers.push({ code: "proposal_capacity", label: "Limite de propostas atingido" });
        if (
          provider.activeJobLimit !== null
          && provider.activeJobCount >= provider.activeJobLimit
        ) blockers.push({ code: "job_capacity", label: "Capacidade de serviços atingida" });
        return { ...provider, blockers, eligible: blockers.length === 0 };
      });
      return {
        metrics: {
          providerCount: providers.length,
          eligibleCount: providers.filter((provider) => provider.eligible).length,
          verificationBlockedCount: providers.filter((provider) => provider.blockers.some((blocker) => blocker.code === "verification")).length,
          coverageBlockedCount: providers.filter((provider) => provider.blockers.some((blocker) => blocker.code === "coverage")).length,
          capacityBlockedCount: providers.filter((provider) => provider.blockers.some((blocker) => blocker.code.endsWith("_capacity"))).length,
        },
        providers,
      };
    });
  }

  async regions(actor: Actor) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const regions = await client.query(`
        SELECT
          region.id,
          region.code,
          region.name,
          region.city,
          region.state,
          region.active,
          region.sort_order AS "sortOrder",
          region.version,
          region.updated_at AS "updatedAt",
          (SELECT count(*)::int FROM service_requests request WHERE request.region_id = region.id) AS "requestCount",
          (
            SELECT count(*)::int
            FROM service_requests request
            WHERE request.region_id = region.id
              AND request.status IN ('open', 'proposals_received', 'booked', 'in_progress')
          ) AS "openRequestCount",
          (
            SELECT count(*)::int
            FROM provider_service_regions coverage
            WHERE coverage.region_id = region.id AND coverage.active = true
          ) AS "providerCount",
          (
            SELECT count(*)::int
            FROM service_region_neighborhoods neighborhood
            WHERE neighborhood.region_id = region.id AND neighborhood.active = true
          ) AS "activeNeighborhoodCount",
          latest_event.event_type AS "latestEventType",
          latest_event.note AS "latestEventNote",
          latest_event.created_at AS "latestEventAt",
          latest_actor.display_name AS "latestActorName",
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', neighborhood.id,
                'slug', neighborhood.slug,
                'name', neighborhood.name,
                'active', neighborhood.active,
                'sortOrder', neighborhood.sort_order,
                'version', neighborhood.version,
                'updatedAt', neighborhood.updated_at,
                'requestCount', (
                  SELECT count(*)::int
                  FROM service_requests request
                  WHERE request.neighborhood_id = neighborhood.id
                )
              )
              ORDER BY neighborhood.sort_order, neighborhood.name
            )
            FROM service_region_neighborhoods neighborhood
            WHERE neighborhood.region_id = region.id
          ), '[]'::jsonb) AS neighborhoods
        FROM service_regions region
        LEFT JOIN LATERAL (
          SELECT event.actor_id, event.event_type, event.note, event.created_at
          FROM service_region_events event
          WHERE event.region_id = region.id
          ORDER BY event.created_at DESC, event.id DESC
          LIMIT 1
        ) latest_event ON true
        LEFT JOIN users latest_actor ON latest_actor.id = latest_event.actor_id
        ORDER BY region.sort_order, region.name
      `);
      const metrics = await client.query(`
        SELECT
          count(*)::int AS "totalCount",
          count(*) FILTER (WHERE active)::int AS "activeCount",
          count(*) FILTER (WHERE NOT active)::int AS "plannedCount",
          (
            SELECT count(*)::int
            FROM service_region_neighborhoods neighborhood
            JOIN service_regions active_region ON active_region.id = neighborhood.region_id
            WHERE neighborhood.active = true AND active_region.active = true
          ) AS "activeNeighborhoodCount"
        FROM service_regions
      `);
      return { metrics: metrics.rows[0], regions: regions.rows };
    });
  }

  async manageRegion(
    actor: Actor,
    regionId: string,
    action: "activate" | "deactivate",
    note: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/regions/${regionId}/actions`,
        payload: { action, note: normalizedNote },
      }, async () => {
      const current = await client.query<{
        id: string;
        name: string;
        active: boolean;
        version: number;
        activeRegionCount: number;
        activeNeighborhoodCount: number;
      }>(`
        SELECT
          region.id,
          region.name,
          region.active,
          region.version,
          (SELECT count(*)::int FROM service_regions active_region WHERE active_region.active = true) AS "activeRegionCount",
          (
            SELECT count(*)::int
            FROM service_region_neighborhoods neighborhood
            WHERE neighborhood.region_id = region.id AND neighborhood.active = true
          ) AS "activeNeighborhoodCount"
        FROM service_regions region
        WHERE region.id = $1
        FOR UPDATE
      `, [regionId]);
      if (!current.rows[0]) throw new NotFoundException("Região não encontrada.");
      const nextActive = action === "activate";
      if (current.rows[0].active === nextActive) {
        throw new ConflictException(nextActive ? "A região já está ativa." : "A região já está desativada.");
      }
      if (!nextActive && current.rows[0].activeRegionCount <= 1) {
        throw new ConflictException("O piloto precisa manter ao menos uma região ativa.");
      }
      if (nextActive && current.rows[0].activeNeighborhoodCount === 0) {
        throw new ConflictException("Ative ao menos um bairro antes de ativar a região.");
      }
      const updated = await client.query(`
        UPDATE service_regions
        SET active = $2, version = version + 1, updated_at = now()
        WHERE id = $1
        RETURNING
          id, code, name, city, state, active,
          sort_order AS "sortOrder", version, updated_at AS "updatedAt"
      `, [regionId, nextActive]);
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO service_region_events (
          id, region_id, actor_id, event_type, from_active, to_active, note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        eventId,
        regionId,
        actor.id,
        nextActive ? "region_activated" : "region_deactivated",
        current.rows[0].active,
        nextActive,
        normalizedNote,
      ]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'service_region.status_changed', 'service_region', $3, $4::jsonb)",
        [actor.id, actor.role, regionId, JSON.stringify({
          from: current.rows[0].active ? "ativa" : "inativa",
          to: nextActive ? "ativa" : "inativa",
          eventId,
          version: current.rows[0].version + 1,
        })],
      );
      return updated.rows[0];
      });
    });
  }

  async manageRegionNeighborhood(
    actor: Actor,
    neighborhoodId: string,
    action: "activate" | "deactivate",
    note: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/region-neighborhoods/${neighborhoodId}/actions`,
        payload: { action, note: normalizedNote },
      }, async () => {
      const current = await client.query<{
        id: string;
        regionId: string;
        name: string;
        active: boolean;
        version: number;
        regionActive: boolean;
        activeNeighborhoodCount: number;
      }>(`
        SELECT
          neighborhood.id,
          neighborhood.region_id AS "regionId",
          neighborhood.name,
          neighborhood.active,
          neighborhood.version,
          region.active AS "regionActive",
          (
            SELECT count(*)::int
            FROM service_region_neighborhoods active_neighborhood
            WHERE active_neighborhood.region_id = neighborhood.region_id
              AND active_neighborhood.active = true
          ) AS "activeNeighborhoodCount"
        FROM service_region_neighborhoods neighborhood
        JOIN service_regions region ON region.id = neighborhood.region_id
        WHERE neighborhood.id = $1
        FOR UPDATE
      `, [neighborhoodId]);
      if (!current.rows[0]) throw new NotFoundException("Bairro não encontrado.");
      const nextActive = action === "activate";
      if (current.rows[0].active === nextActive) {
        throw new ConflictException(nextActive ? "O bairro já está ativo." : "O bairro já está desativado.");
      }
      if (!nextActive && current.rows[0].regionActive && current.rows[0].activeNeighborhoodCount <= 1) {
        throw new ConflictException("Uma região ativa precisa manter ao menos um bairro ativo.");
      }
      const updated = await client.query(`
        UPDATE service_region_neighborhoods
        SET active = $2, version = version + 1, updated_at = now()
        WHERE id = $1
        RETURNING
          id, region_id AS "regionId", slug, name, active,
          sort_order AS "sortOrder", version, updated_at AS "updatedAt"
      `, [neighborhoodId, nextActive]);
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO service_region_events (
          id, region_id, neighborhood_id, actor_id, event_type,
          from_active, to_active, note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        eventId,
        current.rows[0].regionId,
        neighborhoodId,
        actor.id,
        nextActive ? "neighborhood_activated" : "neighborhood_deactivated",
        current.rows[0].active,
        nextActive,
        normalizedNote,
      ]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'service_region_neighborhood.status_changed', 'service_region_neighborhood', $3, $4::jsonb)",
        [actor.id, actor.role, neighborhoodId, JSON.stringify({
          regionId: current.rows[0].regionId,
          from: current.rows[0].active ? "ativo" : "inativo",
          to: nextActive ? "ativo" : "inativo",
          eventId,
          version: current.rows[0].version + 1,
        })],
      );
      return updated.rows[0];
      });
    });
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
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/categories/${categoryId}/actions`,
        payload: { action, note: normalizedNote },
      }, async () => {
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

  async changeStatus(
    actor: Actor,
    caseId: string,
    status: "in_review" | "resolved",
    note: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/cases/${caseId}/transitions`,
        payload: { status, note: normalizedNote },
      }, async () => {
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
    });
  }

  async addNote(actor: Actor, caseId: string, note: string, idempotencyKey: string | undefined) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/cases/${caseId}/notes`,
        payload: { note: normalizedNote },
      }, async () => {
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
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/referrals/${referralId}/transitions`,
        payload: { status, note: normalizedNote },
      }, async () => {
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
    });
  }

  async reports(actor: Actor, rawDays?: string) {
    this.ensureOperation(actor);
    const days = normalizeReportDays(rawDays);
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    const previousFrom = new Date(from);
    previousFrom.setUTCDate(previousFrom.getUTCDate() - days);
    return this.database.withActor(actor, async (client) => {
      const funnelResult = await client.query<{
        requestCount: number;
        proposedRequestCount: number;
        bookingCount: number;
        completedCount: number;
        cancelledCount: number;
        proposalCount: number;
        averageFirstProposalMinutes: number;
      }>(`
        WITH cohort AS (
          SELECT request.id, request.created_at
          FROM service_requests request
          WHERE request.created_at >= $1
        )
        SELECT
          count(*)::int AS "requestCount",
          count(*) FILTER (WHERE first_proposal.created_at IS NOT NULL)::int AS "proposedRequestCount",
          count(*) FILTER (WHERE booking.id IS NOT NULL)::int AS "bookingCount",
          count(*) FILTER (WHERE booking.status = 'completed')::int AS "completedCount",
          count(*) FILTER (WHERE booking.status = 'cancelled')::int AS "cancelledCount",
          COALESCE(sum(proposal_totals.total), 0)::int AS "proposalCount",
          COALESCE(round(avg(
            extract(epoch FROM (first_proposal.created_at - cohort.created_at)) / 60
          ) FILTER (WHERE first_proposal.created_at IS NOT NULL)), 0)::int AS "averageFirstProposalMinutes"
        FROM cohort
        LEFT JOIN LATERAL (
          SELECT min(proposal.created_at) AS created_at
          FROM proposals proposal
          WHERE proposal.request_id = cohort.id
        ) first_proposal ON true
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS total
          FROM proposals proposal
          WHERE proposal.request_id = cohort.id
        ) proposal_totals ON true
        LEFT JOIN bookings booking ON booking.request_id = cohort.id
      `, [from]);
      const funnel = funnelResult.rows[0];

      const financialResult = await client.query<{
        intentCount: number;
        listAmountCents: number;
        discountAmountCents: number;
        netVolumeCents: number;
        settledAmountCents: number;
        refundedAmountCents: number;
        platformFeeCents: number;
        expectedLedgerCents: number;
        ledgerNetCents: number;
        unreconciledCount: number;
        staleAuthorizedCount: number;
        generatedAt: string;
      }>(`
        SELECT
          count(*) FILTER (WHERE intent.created_at >= $1)::int AS "intentCount",
          COALESCE(sum(intent.list_amount_cents) FILTER (WHERE intent.created_at >= $1), 0)::int AS "listAmountCents",
          COALESCE(sum(intent.discount_amount_cents) FILTER (WHERE intent.created_at >= $1), 0)::int AS "discountAmountCents",
          COALESCE(sum(intent.gross_amount_cents) FILTER (WHERE intent.created_at >= $1), 0)::int AS "netVolumeCents",
          COALESCE(sum(intent.gross_amount_cents) FILTER (
            WHERE intent.created_at >= $1 AND intent.status = 'sandbox_settled'
          ), 0)::int AS "settledAmountCents",
          COALESCE(sum(intent.gross_amount_cents) FILTER (
            WHERE intent.created_at >= $1 AND intent.status = 'sandbox_refunded'
          ), 0)::int AS "refundedAmountCents",
          COALESCE((
            SELECT sum(allocation.amount_cents)
            FROM payment_allocations allocation
            JOIN payment_intents period_intent ON period_intent.id = allocation.payment_intent_id
            WHERE allocation.entry_type = 'platform_fee' AND period_intent.created_at >= $1
          ), 0)::int AS "platformFeeCents",
          COALESCE(sum(intent.gross_amount_cents) FILTER (WHERE intent.status = 'sandbox_settled'), 0)::int AS "expectedLedgerCents",
          COALESCE((
            SELECT sum(CASE ledger.direction WHEN 'credit' THEN ledger.amount_cents ELSE -ledger.amount_cents END)
            FROM financial_ledger_entries ledger
          ), 0)::int AS "ledgerNetCents",
          count(*) FILTER (
            WHERE intent.status <> 'sandbox_authorized' AND intent.reconciled_at IS NULL
          )::int AS "unreconciledCount",
          count(*) FILTER (
            WHERE intent.status = 'sandbox_authorized' AND intent.created_at < now() - interval '7 days'
          )::int AS "staleAuthorizedCount",
          now() AS "generatedAt"
        FROM payment_intents intent
      `, [from]);
      const financial = financialResult.rows[0];

      const growthResult = await client.query<{
        referralCount: number;
        approvedReferralCount: number;
        activatedReferralCount: number;
        campaignRedemptionCount: number;
        campaignDiscountCents: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM partner_referrals referral WHERE referral.created_at >= $1) AS "referralCount",
          (SELECT count(*)::int FROM partner_referrals referral
            WHERE referral.created_at >= $1 AND referral.status IN ('approved', 'active')) AS "approvedReferralCount",
          (SELECT count(*)::int FROM partner_referrals referral
            WHERE referral.activated_at >= $1) AS "activatedReferralCount",
          (SELECT count(*)::int FROM campaign_reservations reservation
            WHERE reservation.status = 'redeemed' AND reservation.redeemed_at >= $1) AS "campaignRedemptionCount",
          COALESCE((SELECT sum(reservation.discount_amount_cents)::int FROM campaign_reservations reservation
            WHERE reservation.status = 'redeemed' AND reservation.redeemed_at >= $1), 0) AS "campaignDiscountCents"
      `, [from]);

      const operationsResult = await client.query<{
        cancellationCaseCount: number;
        cancellationResolvedCount: number;
        partnerCaseCount: number;
        partnerResolvedCount: number;
        overduePartnerCaseCount: number;
        verificationSubmittedCount: number;
        verificationApprovedCount: number;
        verificationPendingCount: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM support_cases support WHERE support.created_at >= $1) AS "cancellationCaseCount",
          (SELECT count(*)::int FROM support_cases support WHERE support.resolved_at >= $1) AS "cancellationResolvedCount",
          (SELECT count(*)::int FROM partner_support_cases support WHERE support.created_at >= $1) AS "partnerCaseCount",
          (SELECT count(*)::int FROM partner_support_cases support WHERE support.resolved_at >= $1) AS "partnerResolvedCount",
          (SELECT count(*)::int FROM partner_support_cases support
            WHERE support.status <> 'resolved'
              AND (
                (support.first_responded_at IS NULL AND support.first_response_due_at < now())
                OR support.resolution_due_at < now()
              )) AS "overduePartnerCaseCount",
          (SELECT count(*)::int FROM provider_verifications verification WHERE verification.submitted_at >= $1) AS "verificationSubmittedCount",
          (SELECT count(*)::int FROM provider_verifications verification
            WHERE verification.status = 'approved' AND verification.decided_at >= $1) AS "verificationApprovedCount",
          (SELECT count(*)::int FROM provider_verifications verification
            WHERE verification.status IN ('submitted', 'in_review')) AS "verificationPendingCount"
      `, [from]);

      const previousResult = await client.query<{
        requestCount: number;
        proposedRequestCount: number;
        bookingCount: number;
        completedCount: number;
        averageFirstProposalMinutes: number;
        netVolumeCents: number;
      }>(`
        WITH cohort AS (
          SELECT request.id, request.created_at
          FROM service_requests request
          WHERE request.created_at >= $1 AND request.created_at < $2
        )
        SELECT
          count(*)::int AS "requestCount",
          count(*) FILTER (WHERE first_proposal.created_at IS NOT NULL)::int AS "proposedRequestCount",
          count(*) FILTER (WHERE booking.id IS NOT NULL)::int AS "bookingCount",
          count(*) FILTER (WHERE booking.status = 'completed')::int AS "completedCount",
          COALESCE(round(avg(
            extract(epoch FROM (first_proposal.created_at - cohort.created_at)) / 60
          ) FILTER (WHERE first_proposal.created_at IS NOT NULL)), 0)::int AS "averageFirstProposalMinutes",
          COALESCE((
            SELECT sum(intent.gross_amount_cents)::int
            FROM payment_intents intent
            WHERE intent.created_at >= $1 AND intent.created_at < $2
          ), 0) AS "netVolumeCents"
        FROM cohort
        LEFT JOIN LATERAL (
          SELECT min(proposal.created_at) AS created_at
          FROM proposals proposal
          WHERE proposal.request_id = cohort.id
        ) first_proposal ON true
        LEFT JOIN bookings booking ON booking.request_id = cohort.id
      `, [previousFrom, from]);

      const goalsResult = await client.query<{
        periodDays: 7 | 30 | 90;
        proposalCoverageTargetBps: number;
        bookingConversionTargetBps: number;
        firstProposalTargetMinutes: number;
        overdueCaseLimit: number;
        unreconciledLimit: number;
        version: number;
        updatedAt: string;
      }>(`
        SELECT
          goals.period_days AS "periodDays",
          goals.proposal_coverage_target_bps AS "proposalCoverageTargetBps",
          goals.booking_conversion_target_bps AS "bookingConversionTargetBps",
          goals.first_proposal_target_minutes AS "firstProposalTargetMinutes",
          goals.overdue_case_limit AS "overdueCaseLimit",
          goals.unreconciled_limit AS "unreconciledLimit",
          goals.version,
          goals.updated_at AS "updatedAt"
        FROM operation_report_goals goals
        WHERE goals.period_days = $1
      `, [days]);
      const storedGoals = goalsResult.rows[0];
      if (!storedGoals) throw new NotFoundException("Metas operacionais não configuradas.");

      const categoriesResult = await client.query<{
        id: string;
        slug: string;
        name: string;
        icon: string;
        requestCount: number;
        proposedRequestCount: number;
        bookingCount: number;
        completedCount: number;
        averageProposalCents: number;
        netVolumeCents: number;
      }>(`
        SELECT
          category.id,
          category.slug,
          category.name,
          category.icon,
          (SELECT count(*)::int FROM service_requests request
            WHERE request.category_id = category.id AND request.created_at >= $1) AS "requestCount",
          (SELECT count(DISTINCT request.id)::int
            FROM service_requests request
            JOIN proposals proposal ON proposal.request_id = request.id
            WHERE request.category_id = category.id AND request.created_at >= $1) AS "proposedRequestCount",
          (SELECT count(*)::int
            FROM bookings booking
            JOIN service_requests request ON request.id = booking.request_id
            WHERE request.category_id = category.id AND request.created_at >= $1) AS "bookingCount",
          (SELECT count(*)::int
            FROM bookings booking
            JOIN service_requests request ON request.id = booking.request_id
            WHERE request.category_id = category.id
              AND request.created_at >= $1
              AND booking.status = 'completed') AS "completedCount",
          COALESCE((SELECT round(avg(proposal.amount_cents))::int
            FROM proposals proposal
            JOIN service_requests request ON request.id = proposal.request_id
            WHERE request.category_id = category.id AND request.created_at >= $1), 0) AS "averageProposalCents",
          COALESCE((SELECT sum(intent.gross_amount_cents)::int
            FROM payment_intents intent
            JOIN bookings booking ON booking.id = intent.booking_id
            JOIN service_requests request ON request.id = booking.request_id
            WHERE request.category_id = category.id AND request.created_at >= $1), 0) AS "netVolumeCents"
        FROM service_categories category
        ORDER BY "requestCount" DESC, category.sort_order, category.name
      `, [from]);

      const bucketStep = days === 90 ? "7 days" : "1 day";
      const timelineResult = await client.query<{
        bucketStart: string;
        requestCount: number;
        bookingCount: number;
        netVolumeCents: number;
      }>(`
        WITH buckets AS (
          SELECT
            bucket_start,
            bucket_start + $2::interval AS bucket_end
          FROM generate_series(
            date_trunc('day', $1::timestamptz),
            date_trunc('day', now()),
            $2::interval
          ) bucket_start
        )
        SELECT
          bucket.bucket_start AS "bucketStart",
          (SELECT count(*)::int FROM service_requests request
            WHERE request.created_at >= bucket.bucket_start AND request.created_at < bucket.bucket_end) AS "requestCount",
          (SELECT count(*)::int FROM bookings booking
            WHERE booking.created_at >= bucket.bucket_start AND booking.created_at < bucket.bucket_end) AS "bookingCount",
          COALESCE((SELECT sum(intent.gross_amount_cents)::int FROM payment_intents intent
            WHERE intent.created_at >= bucket.bucket_start AND intent.created_at < bucket.bucket_end), 0) AS "netVolumeCents"
        FROM buckets bucket
        ORDER BY bucket.bucket_start
      `, [from, bucketStep]);

      const requestCount = funnel.requestCount;
      const proposedRequestCount = funnel.proposedRequestCount;
      const bookingCount = funnel.bookingCount;
      const expectedLedgerCents = financial.expectedLedgerCents;
      const ledgerNetCents = financial.ledgerNetCents;
      const proposalCoverageRate = percentage(proposedRequestCount, requestCount);
      const bookingConversionRate = percentage(bookingCount, requestCount);
      const previous = previousResult.rows[0];
      const previousProposalCoverageRate = percentage(previous.proposedRequestCount, previous.requestCount);
      const previousBookingConversionRate = percentage(previous.bookingCount, previous.requestCount);
      const goals = {
        periodDays: storedGoals.periodDays,
        proposalCoverageTarget: storedGoals.proposalCoverageTargetBps / 100,
        bookingConversionTarget: storedGoals.bookingConversionTargetBps / 100,
        firstProposalTargetMinutes: storedGoals.firstProposalTargetMinutes,
        overdueCaseLimit: storedGoals.overdueCaseLimit,
        unreconciledLimit: storedGoals.unreconciledLimit,
        version: storedGoals.version,
        updatedAt: storedGoals.updatedAt,
      };
      const alerts: Array<{
        id: string;
        severity: "warning" | "critical";
        title: string;
        detail: string;
      }> = [];
      if (requestCount === 0) {
        alerts.push({
          id: "no-demand",
          severity: "warning",
          title: "Nenhum pedido no período",
          detail: "Revise aquisição, disponibilidade regional e comunicação do catálogo.",
        });
      } else {
        if (proposalCoverageRate < goals.proposalCoverageTarget) {
          alerts.push({
            id: "proposal-coverage",
            severity: goals.proposalCoverageTarget - proposalCoverageRate >= 10 ? "critical" : "warning",
            title: "Cobertura de propostas abaixo da meta",
            detail: `${proposalCoverageRate}% realizados para uma meta de ${goals.proposalCoverageTarget}%.`,
          });
        }
        if (bookingConversionRate < goals.bookingConversionTarget) {
          alerts.push({
            id: "booking-conversion",
            severity: goals.bookingConversionTarget - bookingConversionRate >= 10 ? "critical" : "warning",
            title: "Conversão em agendamento abaixo da meta",
            detail: `${bookingConversionRate}% realizados para uma meta de ${goals.bookingConversionTarget}%.`,
          });
        }
        if (funnel.averageFirstProposalMinutes > goals.firstProposalTargetMinutes) {
          alerts.push({
            id: "first-proposal",
            severity: funnel.averageFirstProposalMinutes > goals.firstProposalTargetMinutes * 2 ? "critical" : "warning",
            title: "Primeira proposta acima do tempo-alvo",
            detail: `${funnel.averageFirstProposalMinutes} minutos para uma meta de até ${goals.firstProposalTargetMinutes}.`,
          });
        }
      }
      if (operationsResult.rows[0].overduePartnerCaseCount > goals.overdueCaseLimit) {
        alerts.push({
          id: "partner-support-sla",
          severity: "critical",
          title: "SLA da central do parceiro vencido",
          detail: `${operationsResult.rows[0].overduePartnerCaseCount} caso(s) vencido(s); limite configurado em ${goals.overdueCaseLimit}.`,
        });
      }
      if (
        financial.unreconciledCount > goals.unreconciledLimit
        || ledgerNetCents !== expectedLedgerCents
      ) {
        alerts.push({
          id: "financial-reconciliation",
          severity: "critical",
          title: "Reconciliação financeira exige atenção",
          detail: `${financial.unreconciledCount} pendência(s) e diferença de ${ledgerNetCents - expectedLedgerCents} centavo(s).`,
        });
      }
      if (financial.staleAuthorizedCount > 0) {
        alerts.push({
          id: "stale-authorizations",
          severity: "warning",
          title: "Autorizações antigas no sandbox",
          detail: `${financial.staleAuthorizedCount} autorização(ões) aguardam desfecho há mais de sete dias.`,
        });
      }
      const reportId = randomUUID();
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'operation_report.generated', 'operation_report', $3, $4::jsonb)",
        [actor.id, actor.role, reportId, JSON.stringify({
          days,
          from: from.toISOString(),
          requestCount,
          bookingCount,
          intentCount: financial.intentCount,
        })],
      );
      return {
        period: {
          days,
          from: from.toISOString(),
          to: financial.generatedAt,
          bucket: days === 90 ? "week" : "day",
        },
        funnel: {
          ...funnel,
          proposalCoverageRate,
          bookingConversionRate,
          completionRate: percentage(funnel.completedCount, bookingCount),
          averageProposalsPerRequest: requestCount > 0
            ? Math.round((funnel.proposalCount / requestCount) * 100) / 100
            : 0,
        },
        financial: {
          ...financial,
          discountRate: percentage(financial.discountAmountCents, financial.listAmountCents),
          reconciliationDifferenceCents: ledgerNetCents - expectedLedgerCents,
          reconciled: ledgerNetCents === expectedLedgerCents && financial.unreconciledCount === 0,
        },
        growth: {
          ...growthResult.rows[0],
          referralApprovalRate: percentage(
            growthResult.rows[0].approvedReferralCount,
            growthResult.rows[0].referralCount,
          ),
        },
        operations: operationsResult.rows[0],
        goals,
        alerts,
        comparison: {
          period: {
            from: previousFrom.toISOString(),
            to: from.toISOString(),
          },
          previous: {
            ...previous,
            proposalCoverageRate: previousProposalCoverageRate,
            bookingConversionRate: previousBookingConversionRate,
          },
          changes: {
            requestCountPercent: relativeChange(requestCount, previous.requestCount),
            proposalCoveragePoints: percentagePointChange(
              proposalCoverageRate,
              previousProposalCoverageRate,
            ),
            bookingConversionPoints: percentagePointChange(
              bookingConversionRate,
              previousBookingConversionRate,
            ),
            firstProposalMinutesPercent: relativeChange(
              funnel.averageFirstProposalMinutes,
              previous.averageFirstProposalMinutes,
            ),
            netVolumePercent: relativeChange(
              financial.netVolumeCents,
              previous.netVolumeCents,
            ),
          },
        },
        categories: categoriesResult.rows.map((category) => ({
          ...category,
          proposalCoverageRate: percentage(category.proposedRequestCount, category.requestCount),
          bookingConversionRate: percentage(category.bookingCount, category.requestCount),
        })),
        timeline: timelineResult.rows,
      };
    });
  }

  async updateReportGoals(
    actor: Actor,
    input: UpdateOperationReportGoalsDto,
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const note = this.normalizeNote(input.note);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: "/api/v1/operation/reports/goals",
        payload: {
          periodDays: input.periodDays,
          proposalCoverageTargetBps: input.proposalCoverageTargetBps,
          bookingConversionTargetBps: input.bookingConversionTargetBps,
          firstProposalTargetMinutes: input.firstProposalTargetMinutes,
          overdueCaseLimit: input.overdueCaseLimit,
          unreconciledLimit: input.unreconciledLimit,
          note,
        },
      }, async () => {
      const currentResult = await client.query<{
        periodDays: 7 | 30 | 90;
        proposalCoverageTargetBps: number;
        bookingConversionTargetBps: number;
        firstProposalTargetMinutes: number;
        overdueCaseLimit: number;
        unreconciledLimit: number;
        version: number;
      }>(`
        SELECT
          period_days AS "periodDays",
          proposal_coverage_target_bps AS "proposalCoverageTargetBps",
          booking_conversion_target_bps AS "bookingConversionTargetBps",
          first_proposal_target_minutes AS "firstProposalTargetMinutes",
          overdue_case_limit AS "overdueCaseLimit",
          unreconciled_limit AS "unreconciledLimit",
          version
        FROM operation_report_goals
        WHERE period_days = $1
        FOR UPDATE
      `, [input.periodDays]);
      const current = currentResult.rows[0];
      if (!current) throw new NotFoundException("Metas operacionais não configuradas.");

      const nextValues = {
        proposalCoverageTargetBps: input.proposalCoverageTargetBps,
        bookingConversionTargetBps: input.bookingConversionTargetBps,
        firstProposalTargetMinutes: input.firstProposalTargetMinutes,
        overdueCaseLimit: input.overdueCaseLimit,
        unreconciledLimit: input.unreconciledLimit,
      };
      const previousValues = {
        proposalCoverageTargetBps: current.proposalCoverageTargetBps,
        bookingConversionTargetBps: current.bookingConversionTargetBps,
        firstProposalTargetMinutes: current.firstProposalTargetMinutes,
        overdueCaseLimit: current.overdueCaseLimit,
        unreconciledLimit: current.unreconciledLimit,
      };
      if (JSON.stringify(previousValues) === JSON.stringify(nextValues)) {
        throw new ConflictException("As metas informadas já estão vigentes.");
      }

      const updatedResult = await client.query<{
        periodDays: 7 | 30 | 90;
        proposalCoverageTargetBps: number;
        bookingConversionTargetBps: number;
        firstProposalTargetMinutes: number;
        overdueCaseLimit: number;
        unreconciledLimit: number;
        version: number;
        updatedAt: string;
      }>(`
        WITH updated AS (
          UPDATE operation_report_goals
          SET
            proposal_coverage_target_bps = $2,
            booking_conversion_target_bps = $3,
            first_proposal_target_minutes = $4,
            overdue_case_limit = $5,
            unreconciled_limit = $6,
            version = version + 1,
            updated_by = $7,
            updated_at = now()
          WHERE period_days = $1
          RETURNING *
        )
        SELECT
          updated.period_days AS "periodDays",
          updated.proposal_coverage_target_bps AS "proposalCoverageTargetBps",
          updated.booking_conversion_target_bps AS "bookingConversionTargetBps",
          updated.first_proposal_target_minutes AS "firstProposalTargetMinutes",
          updated.overdue_case_limit AS "overdueCaseLimit",
          updated.unreconciled_limit AS "unreconciledLimit",
          updated.version,
          updated.updated_at AS "updatedAt"
        FROM updated
      `, [
        input.periodDays,
        input.proposalCoverageTargetBps,
        input.bookingConversionTargetBps,
        input.firstProposalTargetMinutes,
        input.overdueCaseLimit,
        input.unreconciledLimit,
        actor.id,
      ]);
      const updated = updatedResult.rows[0];
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO operation_report_goal_events (
          id, period_days, actor_id, previous_values, next_values, note
        ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
      `, [
        eventId,
        input.periodDays,
        actor.id,
        JSON.stringify(previousValues),
        JSON.stringify(nextValues),
        note,
      ]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'operation_report_goals.updated', 'operation_report_goal', $3, $4::jsonb)",
        [actor.id, actor.role, eventId, JSON.stringify({
          periodDays: input.periodDays,
          fromVersion: current.version,
          toVersion: updated.version,
        })],
      );
      return {
        periodDays: updated.periodDays,
        proposalCoverageTarget: updated.proposalCoverageTargetBps / 100,
        bookingConversionTarget: updated.bookingConversionTargetBps / 100,
        firstProposalTargetMinutes: updated.firstProposalTargetMinutes,
        overdueCaseLimit: updated.overdueCaseLimit,
        unreconciledLimit: updated.unreconciledLimit,
        version: updated.version,
        updatedAt: updated.updatedAt,
      };
      });
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
                  'partner_support_case.status_changed',
                  'partner_support_dispute.status_changed',
                  'marketing_campaign.status_changed',
                  'operation_report_goals.updated'
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
          const entityToken = event.entityType === "notification_preferences"
            ? event.entityId.replaceAll("-", "").slice(-6).toUpperCase()
            : event.entityId.replaceAll("-", "").slice(0, 6).toUpperCase();
          return {
            id: event.id,
            action: event.action,
            category: copy.category,
            title: copy.title,
            detail: transition ? `${copy.detail} ${transition}.` : copy.detail,
            reference: event.publicCode ?? `${prefix}-${entityToken}`,
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
