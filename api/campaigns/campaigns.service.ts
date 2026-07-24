import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import {
  campaignAbuseLevel,
  campaignEligibilityResult,
  isValidCouponCode,
  normalizeCouponCode,
} from "./campaign-rules.js";
import type { CreateCampaignDto } from "./campaigns.dto.js";

interface CampaignOffer {
  id: string;
  name: string;
  code: string;
  description: string;
  discountType: "fixed" | "percentage";
  discountValue: number;
  maxDiscountCents: number | null;
  minAmountCents: number;
  totalRedemptionLimit: number;
  perCustomerLimit: number;
  startsAt: string;
  endsAt: string;
  status: "active" | "paused";
  targetingMode: "contextual" | "consented";
  targetCategoryId: string | null;
  targetCategoryName: string | null;
  targetRegionId: string | null;
  targetRegionName: string | null;
  marketingConsentGranted: boolean;
  totalUsage: number;
  customerUsage: number;
}

type CampaignValidationResult =
  | "accepted"
  | "not_found"
  | "outside_segment"
  | "consent_required"
  | "total_limit"
  | "customer_limit"
  | "blocked";

interface CampaignContext {
  categoryId?: string;
  regionId?: string;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async validateCoupon(actor: Actor, rawCode: string, context: CampaignContext = {}) {
    if (actor.role !== "customer") throw new ForbiddenException("Somente clientes podem validar cupons.");
    const code = this.normalizeCode(rawCode);
    const outcome = await this.database.withActor(actor, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`campaign-validation:${actor.id}`]);
      const abuse = await client.query<{ rejectedCount15m: number }>(`
        SELECT rejected_count_15m AS "rejectedCount15m"
        FROM campaign_validation_abuse_state($1)
      `, [actor.id]);
      if ((abuse.rows[0]?.rejectedCount15m ?? 0) >= 10) {
        await this.recordValidationAttempt(client, actor.id, code, null, context, "blocked");
        return { result: "blocked" as CampaignValidationResult, offer: null };
      }

      const offer = await this.findAvailableOffer(client, actor.id, code, false);
      if (!offer) {
        await this.recordValidationAttempt(client, actor.id, code, null, context, "not_found");
        return { result: "not_found" as CampaignValidationResult, offer: null };
      }
      const result = this.validationResult(offer, context);
      await this.recordValidationAttempt(client, actor.id, code, offer.id, context, result);
      return { result, offer: result === "accepted" ? this.publicOffer(offer) : null };
    });
    if (outcome.result !== "accepted" || !outcome.offer) this.throwValidationError(outcome.result);
    return { offer: outcome.offer };
  }

  async reserveForRequest(client: PoolClient, actor: Actor, requestId: string, rawCode?: string) {
    if (!rawCode?.trim()) return null;
    if (actor.role !== "customer") throw new ForbiddenException("Somente clientes podem usar cupons.");
    const code = this.normalizeCode(rawCode);
    const request = await client.query<{ categoryId: string; regionId: string }>(`
      SELECT category_id AS "categoryId", region_id AS "regionId"
      FROM service_requests
      WHERE id = $1 AND customer_id = $2
    `, [requestId, actor.id]);
    if (!request.rows[0]) throw new NotFoundException("Solicitação indisponível para reservar o cupom.");
    const offer = await this.findAvailableOffer(client, actor.id, code, true);
    if (!offer) throw new NotFoundException("Cupom inválido ou indisponível.");
    const result = this.validationResult(offer, request.rows[0]);
    if (result !== "accepted") this.throwValidationError(result);

    const reservationId = randomUUID();
    const eligibilitySnapshot = {
      targetingMode: offer.targetingMode,
      categoryMatched: !offer.targetCategoryId || offer.targetCategoryId === request.rows[0].categoryId,
      regionMatched: !offer.targetRegionId || offer.targetRegionId === request.rows[0].regionId,
      consentRequired: offer.targetingMode === "consented",
      consentGranted: offer.marketingConsentGranted,
      targetCategoryId: offer.targetCategoryId,
      targetRegionId: offer.targetRegionId,
    };
    await client.query(`
      INSERT INTO campaign_reservations (
        id, campaign_id, service_request_id, customer_id, coupon_code,
        discount_type, discount_value, max_discount_cents, min_amount_cents,
        status, eligibility_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reserved', $10::jsonb)
    `, [
      reservationId,
      offer.id,
      requestId,
      actor.id,
      offer.code,
      offer.discountType,
      offer.discountValue,
      offer.maxDiscountCents,
      offer.minAmountCents,
      JSON.stringify(eligibilitySnapshot),
    ]);
    await client.query(
      "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'marketing_campaign.reserved', 'campaign_reservation', $3, $4::jsonb)",
      [actor.id, actor.role, reservationId, JSON.stringify({
        campaignId: offer.id,
        requestId,
        couponCode: offer.code,
        targetingMode: offer.targetingMode,
      })],
    );
    return { reservationId, ...this.publicOffer(offer) };
  }

  async list(actor: Actor) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const campaigns = await client.query(`
        SELECT
          campaign.id,
          campaign.name,
          campaign.coupon_code AS code,
          campaign.description,
          campaign.discount_type AS "discountType",
          campaign.discount_value AS "discountValue",
          campaign.max_discount_cents AS "maxDiscountCents",
          campaign.min_amount_cents AS "minAmountCents",
          campaign.total_redemption_limit AS "totalRedemptionLimit",
          campaign.per_customer_limit AS "perCustomerLimit",
          campaign.starts_at AS "startsAt",
          campaign.ends_at AS "endsAt",
          campaign.status,
          campaign.targeting_mode AS "targetingMode",
          campaign.target_category_id AS "targetCategoryId",
          target_category.name AS "targetCategoryName",
          campaign.target_region_id AS "targetRegionId",
          target_region.name AS "targetRegionName",
          campaign.created_at AS "createdAt",
          campaign.updated_at AS "updatedAt",
          creator.display_name AS "createdByName",
          (SELECT count(*)::int FROM campaign_reservations reservation
            WHERE reservation.campaign_id = campaign.id
              AND reservation.status IN ('reserved', 'redeemed')) AS "usedCount",
          (SELECT count(*)::int FROM campaign_reservations reservation
            WHERE reservation.campaign_id = campaign.id
              AND reservation.status = 'redeemed') AS "redeemedCount",
          (SELECT COALESCE(sum(reservation.discount_amount_cents), 0)::int
            FROM campaign_reservations reservation
            WHERE reservation.campaign_id = campaign.id
              AND reservation.status = 'redeemed') AS "discountGrantedCents",
          (SELECT count(*)::int FROM marketing_campaign_events event
            WHERE event.campaign_id = campaign.id) AS "eventCount",
          (SELECT count(*)::int FROM campaign_validation_attempts attempt
            WHERE attempt.campaign_id = campaign.id
              AND attempt.occurred_at >= now() - interval '24 hours') AS "validationCount24h",
          (SELECT count(*)::int FROM campaign_validation_attempts attempt
            WHERE attempt.campaign_id = campaign.id
              AND attempt.occurred_at >= now() - interval '24 hours'
              AND attempt.result <> 'accepted') AS "rejectedCount24h",
          (SELECT count(*)::int FROM campaign_validation_attempts attempt
            WHERE attempt.campaign_id = campaign.id
              AND attempt.occurred_at >= now() - interval '24 hours'
              AND attempt.result = 'blocked') AS "blockedCount24h",
          (SELECT count(*)::int FROM campaign_validation_attempts attempt
            WHERE attempt.campaign_id = campaign.id
              AND attempt.occurred_at >= now() - interval '24 hours'
              AND attempt.result = 'consent_required') AS "consentDeniedCount24h",
          (SELECT count(*)::int FROM campaign_validation_attempts attempt
            WHERE attempt.campaign_id = campaign.id
              AND attempt.occurred_at >= now() - interval '24 hours'
              AND attempt.result = 'outside_segment') AS "outsideSegmentCount24h",
          (
            SELECT count(*)::int
            FROM (
              SELECT attempt.customer_id
              FROM campaign_validation_attempts attempt
              WHERE attempt.campaign_id = campaign.id
                AND attempt.occurred_at >= now() - interval '24 hours'
              GROUP BY attempt.customer_id
              HAVING count(*) FILTER (WHERE attempt.result <> 'accepted') >= 5
            ) suspicious
          ) AS "suspiciousCustomerCount24h",
          latest_event.note AS "latestEventNote",
          latest_event.created_at AS "latestEventAt",
          latest_actor.display_name AS "latestActorName"
        FROM marketing_campaigns campaign
        JOIN users creator ON creator.id = campaign.created_by
        LEFT JOIN service_categories target_category ON target_category.id = campaign.target_category_id
        LEFT JOIN service_regions target_region ON target_region.id = campaign.target_region_id
        LEFT JOIN LATERAL (
          SELECT event.actor_id, event.note, event.created_at
          FROM marketing_campaign_events event
          WHERE event.campaign_id = campaign.id
          ORDER BY event.created_at DESC, event.id DESC
          LIMIT 1
        ) latest_event ON true
        LEFT JOIN users latest_actor ON latest_actor.id = latest_event.actor_id
        ORDER BY campaign.created_at DESC, campaign.id DESC
      `);
      const metrics = await client.query(`
        SELECT
          count(*)::int AS "totalCount",
          count(*) FILTER (
            WHERE status = 'active' AND starts_at <= now() AND ends_at > now()
          )::int AS "liveCount",
          count(*) FILTER (
            WHERE status = 'active' AND starts_at > now()
          )::int AS "scheduledCount",
          count(*) FILTER (
            WHERE status = 'paused' OR ends_at <= now()
          )::int AS "inactiveCount",
          COALESCE((SELECT count(*) FROM campaign_reservations WHERE status = 'redeemed'), 0)::int AS "redeemedCount",
          COALESCE((SELECT sum(discount_amount_cents) FROM campaign_reservations WHERE status = 'redeemed'), 0)::int AS "discountGrantedCents"
        FROM marketing_campaigns
      `);
      const monitoring = await client.query(`
        WITH suspicious_customers AS (
          SELECT customer_id
          FROM campaign_validation_attempts
          WHERE occurred_at >= now() - interval '24 hours'
          GROUP BY customer_id
          HAVING count(*) FILTER (WHERE result <> 'accepted') >= 5
            OR count(DISTINCT code_fingerprint) FILTER (WHERE result <> 'accepted') >= 3
        )
        SELECT
          count(*)::int AS "attemptCount24h",
          count(*) FILTER (WHERE result <> 'accepted')::int AS "rejectedCount24h",
          count(*) FILTER (WHERE result = 'blocked')::int AS "blockedCount24h",
          (SELECT count(*)::int FROM suspicious_customers) AS "suspiciousCustomerCount24h"
        FROM campaign_validation_attempts
        WHERE occurred_at >= now() - interval '24 hours'
      `);
      const categories = await client.query(`
        SELECT id, name, icon
        FROM service_categories
        WHERE active = true
        ORDER BY sort_order, name
      `);
      const regions = await client.query(`
        SELECT id, name, city, state
        FROM service_regions
        WHERE active = true
        ORDER BY sort_order, name
      `);
      const campaignRows = campaigns.rows.map((campaign) => ({
        ...campaign,
        conversionRate: campaign.usedCount > 0
          ? Math.round((campaign.redeemedCount / campaign.usedCount) * 1000) / 10
          : 0,
        abuseLevel: campaignAbuseLevel({
          rejectedCount: campaign.rejectedCount24h,
          blockedCount: campaign.blockedCount24h,
          suspiciousCustomerCount: campaign.suspiciousCustomerCount24h,
        }),
      }));
      const monitoringRow = monitoring.rows[0];
      return {
        metrics: metrics.rows[0],
        campaigns: campaignRows,
        catalog: { categories: categories.rows, regions: regions.rows },
        monitoring: {
          ...monitoringRow,
          abuseLevel: campaignAbuseLevel({
            rejectedCount: monitoringRow.rejectedCount24h,
            blockedCount: monitoringRow.blockedCount24h,
            suspiciousCustomerCount: monitoringRow.suspiciousCustomerCount24h,
          }),
        },
      };
    });
  }

  async create(actor: Actor, input: CreateCampaignDto, idempotencyKey: string | undefined) {
    this.ensureOperation(actor);
    const name = input.name.trim();
    const code = this.normalizeCode(input.code);
    const description = input.description.trim();
    const note = this.normalizeNote(input.note);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const targetingMode = input.targetingMode ?? "contextual";
    const targetCategoryId = input.targetCategoryId ?? null;
    const targetRegionId = input.targetRegionId ?? null;
    if (endsAt <= startsAt) throw new BadRequestException("O fim da campanha deve ocorrer depois do início.");
    if (endsAt <= new Date()) throw new BadRequestException("A campanha precisa terminar no futuro.");
    if (input.perCustomerLimit > input.totalRedemptionLimit) {
      throw new BadRequestException("O limite por cliente não pode superar o limite total.");
    }
    if (input.discountType === "percentage" && input.discountValue > 5000) {
      throw new BadRequestException("O desconto percentual máximo é de 50%.");
    }
    if (input.discountType === "percentage" && !input.maxDiscountCents) {
      throw new BadRequestException("Defina o teto em reais para o desconto percentual.");
    }

    return this.database.withActor(actor, async (client) => {
      await this.ensureActiveTarget(client, "category", targetCategoryId);
      await this.ensureActiveTarget(client, "region", targetRegionId);
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: "/api/v1/operation/campaigns",
        payload: {
          name,
          code,
          description,
          discountType: input.discountType,
          discountValue: input.discountValue,
          maxDiscountCents: input.discountType === "percentage" ? input.maxDiscountCents : null,
          minAmountCents: input.minAmountCents,
          totalRedemptionLimit: input.totalRedemptionLimit,
          perCustomerLimit: input.perCustomerLimit,
          targetingMode,
          targetCategoryId,
          targetRegionId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          note,
        },
      }, async () => {
      const existing = await client.query("SELECT id FROM marketing_campaigns WHERE coupon_code = $1", [code]);
      if (existing.rows[0]) throw new ConflictException("Este código de cupom já está em uso.");
      const campaignId = randomUUID();
      const campaign = await client.query(`
        INSERT INTO marketing_campaigns (
          id, name, coupon_code, description, discount_type, discount_value,
          max_discount_cents, min_amount_cents, total_redemption_limit,
          per_customer_limit, starts_at, ends_at, status, created_by,
          targeting_mode, target_category_id, target_region_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          'active', $13, $14, $15, $16
        )
        RETURNING
          id, name, coupon_code AS code, description, discount_type AS "discountType",
          discount_value AS "discountValue", max_discount_cents AS "maxDiscountCents",
          min_amount_cents AS "minAmountCents", total_redemption_limit AS "totalRedemptionLimit",
          per_customer_limit AS "perCustomerLimit", starts_at AS "startsAt",
          ends_at AS "endsAt", status, targeting_mode AS "targetingMode",
          target_category_id AS "targetCategoryId", target_region_id AS "targetRegionId",
          created_at AS "createdAt", updated_at AS "updatedAt"
      `, [
        campaignId,
        name,
        code,
        description,
        input.discountType,
        input.discountValue,
        input.discountType === "percentage" ? input.maxDiscountCents : null,
        input.minAmountCents,
        input.totalRedemptionLimit,
        input.perCustomerLimit,
        startsAt,
        endsAt,
        actor.id,
        targetingMode,
        targetCategoryId,
        targetRegionId,
      ]);
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO marketing_campaign_events (
          id, campaign_id, actor_id, event_type, to_status, note
        ) VALUES ($1, $2, $3, 'created', 'active', $4)
      `, [eventId, campaignId, actor.id, note]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'marketing_campaign.created', 'marketing_campaign', $3, $4::jsonb)",
        [actor.id, actor.role, campaignId, JSON.stringify({
          couponCode: code,
          eventId,
          targetingMode,
          targetCategoryId,
          targetRegionId,
        })],
      );
      return campaign.rows[0];
      });
    });
  }

  async changeStatus(
    actor: Actor,
    campaignId: string,
    action: "activate" | "pause",
    rawNote: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const note = this.normalizeNote(rawNote);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/campaigns/${campaignId}/actions`,
        payload: { action, note },
      }, async () => {
      const current = await client.query<{ id: string; code: string; status: "active" | "paused"; endsAt: Date }>(`
        SELECT id, coupon_code AS code, status, ends_at AS "endsAt"
        FROM marketing_campaigns
        WHERE id = $1
        FOR UPDATE
      `, [campaignId]);
      if (!current.rows[0]) throw new NotFoundException("Campanha não encontrada.");
      const nextStatus = action === "activate" ? "active" : "paused";
      if (current.rows[0].status === nextStatus) {
        throw new ConflictException(nextStatus === "active" ? "A campanha já está ativa." : "A campanha já está pausada.");
      }
      if (nextStatus === "active" && current.rows[0].endsAt <= new Date()) {
        throw new ConflictException("Campanhas encerradas não podem ser reativadas.");
      }
      const updated = await client.query(`
        UPDATE marketing_campaigns
        SET status = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, coupon_code AS code, status, updated_at AS "updatedAt"
      `, [campaignId, nextStatus]);
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO marketing_campaign_events (
          id, campaign_id, actor_id, event_type, from_status, to_status, note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [eventId, campaignId, actor.id, action === "activate" ? "activated" : "paused", current.rows[0].status, nextStatus, note]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'marketing_campaign.status_changed', 'marketing_campaign', $3, $4::jsonb)",
        [actor.id, actor.role, campaignId, JSON.stringify({ from: current.rows[0].status, to: nextStatus, couponCode: current.rows[0].code, eventId })],
      );
      return updated.rows[0];
      });
    });
  }

  private async findAvailableOffer(
    client: PoolClient,
    customerId: string,
    code: string,
    lock: boolean,
  ): Promise<CampaignOffer | null> {
    if (lock) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [code]);
    }
    const result = await client.query<CampaignOffer>(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.coupon_code AS code,
        campaign.description,
        campaign.discount_type AS "discountType",
        campaign.discount_value AS "discountValue",
        campaign.max_discount_cents AS "maxDiscountCents",
        campaign.min_amount_cents AS "minAmountCents",
        campaign.total_redemption_limit AS "totalRedemptionLimit",
        campaign.per_customer_limit AS "perCustomerLimit",
        campaign.starts_at AS "startsAt",
        campaign.ends_at AS "endsAt",
        campaign.status,
        campaign.targeting_mode AS "targetingMode",
        campaign.target_category_id AS "targetCategoryId",
        target_category.name AS "targetCategoryName",
        campaign.target_region_id AS "targetRegionId",
        target_region.name AS "targetRegionName",
        EXISTS (
          SELECT 1
          FROM consent_preferences preference
          WHERE preference.user_id = $2
            AND preference.purpose = 'marketing_communications'
            AND preference.granted = true
        ) AS "marketingConsentGranted",
        usage.total_usage AS "totalUsage",
        usage.customer_usage AS "customerUsage"
      FROM marketing_campaigns campaign
      CROSS JOIN LATERAL marketing_campaign_usage(campaign.id, $2) usage
      LEFT JOIN service_categories target_category ON target_category.id = campaign.target_category_id
      LEFT JOIN service_regions target_region ON target_region.id = campaign.target_region_id
      WHERE campaign.coupon_code = $1
        AND campaign.status = 'active'
        AND campaign.starts_at <= now()
        AND campaign.ends_at > now()
    `, [code, customerId]);
    return result.rows[0] ?? null;
  }

  private validationResult(offer: CampaignOffer, context: CampaignContext): CampaignValidationResult {
    return campaignEligibilityResult({
      totalUsage: offer.totalUsage,
      totalRedemptionLimit: offer.totalRedemptionLimit,
      customerUsage: offer.customerUsage,
      perCustomerLimit: offer.perCustomerLimit,
      targetingMode: offer.targetingMode,
      targetCategoryId: offer.targetCategoryId,
      targetRegionId: offer.targetRegionId,
      contextCategoryId: context.categoryId,
      contextRegionId: context.regionId,
      marketingConsentGranted: offer.marketingConsentGranted,
    });
  }

  private publicOffer(offer: CampaignOffer) {
    const scope = [offer.targetCategoryName, offer.targetRegionName].filter(Boolean);
    return {
      name: offer.name,
      code: offer.code,
      description: offer.description,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      maxDiscountCents: offer.maxDiscountCents,
      minAmountCents: offer.minAmountCents,
      endsAt: offer.endsAt,
      targetingMode: offer.targetingMode,
      eligibilityLabel: scope.length > 0 ? scope.join(" · ") : "Todos os serviços do piloto",
      consentBasis: offer.targetingMode === "consented"
        ? "Preferência de campanhas autorizada"
        : "Contexto do pedido, sem perfil comportamental",
    };
  }

  private async recordValidationAttempt(
    client: PoolClient,
    customerId: string,
    code: string,
    campaignId: string | null,
    context: CampaignContext,
    result: CampaignValidationResult,
  ) {
    const fingerprint = createHash("sha256").update(code, "utf8").digest("hex");
    await client.query(`
      INSERT INTO campaign_validation_attempts (
        id, customer_id, campaign_id, code_fingerprint,
        context_category_id, context_region_id, result
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      randomUUID(),
      customerId,
      campaignId,
      fingerprint,
      context.categoryId ?? null,
      context.regionId ?? null,
      result,
    ]);
  }

  private throwValidationError(result: CampaignValidationResult): never {
    if (result === "accepted") {
      throw new Error("Resultado aceito não pode ser convertido em erro de validação.");
    }
    if (result === "blocked") {
      throw new HttpException("Muitas tentativas de cupom. Aguarde 15 minutos e tente novamente.", 429);
    }
    if (result === "outside_segment") {
      throw new ConflictException("Este cupom não se aplica à categoria ou região selecionada.");
    }
    if (result === "consent_required") {
      throw new ForbiddenException("Este cupom exige autorização vigente para novidades e campanhas.");
    }
    if (result === "total_limit") {
      throw new ConflictException("Este cupom atingiu o limite total de usos.");
    }
    if (result === "customer_limit") {
      throw new ConflictException("Este cupom já atingiu o limite para a sua conta.");
    }
    throw new NotFoundException("Cupom inválido ou indisponível.");
  }

  private async ensureActiveTarget(
    client: PoolClient,
    target: "category" | "region",
    id: string | null,
  ) {
    if (!id) return;
    const table = target === "category" ? "service_categories" : "service_regions";
    const result = await client.query(`SELECT id FROM ${table} WHERE id = $1 AND active = true`, [id]);
    if (!result.rows[0]) {
      throw new BadRequestException(
        target === "category" ? "Categoria-alvo indisponível." : "Região-alvo indisponível.",
      );
    }
  }

  private ensureOperation(actor: Actor) {
    if (actor.role !== "operation") throw new ForbiddenException("Somente a Operação pode gerenciar campanhas.");
  }

  private normalizeCode(value: string) {
    const code = normalizeCouponCode(value);
    if (!isValidCouponCode(code)) {
      throw new BadRequestException("Use de 3 a 32 letras, números, hífen ou sublinhado no cupom.");
    }
    return code;
  }

  private normalizeNote(value: string) {
    const note = value.trim();
    if (note.length < 10 || note.length > 1000) {
      throw new BadRequestException("Registre uma justificativa entre 10 e 1000 caracteres.");
    }
    return note;
  }
}
