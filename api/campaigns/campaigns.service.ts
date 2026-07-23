import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { isValidCouponCode, normalizeCouponCode } from "./campaign-rules.js";
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
  totalUsage: number;
  customerUsage: number;
}

@Injectable()
export class CampaignsService {
  constructor(private readonly database: DatabaseService) {}

  async validateCoupon(actor: Actor, rawCode: string) {
    if (actor.role !== "customer") throw new ForbiddenException("Somente clientes podem validar cupons.");
    const code = this.normalizeCode(rawCode);
    return this.database.withActor(actor, async (client) => {
      const offer = await this.findAvailableOffer(client, actor.id, code, false);
      if (!offer) throw new NotFoundException("Cupom inválido ou indisponível.");
      this.ensureLimits(offer);
      return { offer: this.publicOffer(offer) };
    });
  }

  async reserveForRequest(client: PoolClient, actor: Actor, requestId: string, rawCode?: string) {
    if (!rawCode?.trim()) return null;
    if (actor.role !== "customer") throw new ForbiddenException("Somente clientes podem usar cupons.");
    const code = this.normalizeCode(rawCode);
    const offer = await this.findAvailableOffer(client, actor.id, code, true);
    if (!offer) throw new NotFoundException("Cupom inválido ou indisponível.");
    this.ensureLimits(offer);

    const reservationId = randomUUID();
    await client.query(`
      INSERT INTO campaign_reservations (
        id, campaign_id, service_request_id, customer_id, coupon_code,
        discount_type, discount_value, max_discount_cents, min_amount_cents, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reserved')
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
    ]);
    await client.query(
      "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'marketing_campaign.reserved', 'campaign_reservation', $3, $4::jsonb)",
      [actor.id, actor.role, reservationId, JSON.stringify({ campaignId: offer.id, requestId, couponCode: offer.code })],
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
          latest_event.note AS "latestEventNote",
          latest_event.created_at AS "latestEventAt",
          latest_actor.display_name AS "latestActorName"
        FROM marketing_campaigns campaign
        JOIN users creator ON creator.id = campaign.created_by
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
      return { metrics: metrics.rows[0], campaigns: campaigns.rows };
    });
  }

  async create(actor: Actor, input: CreateCampaignDto) {
    this.ensureOperation(actor);
    const code = this.normalizeCode(input.code);
    const note = this.normalizeNote(input.note);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
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
      const existing = await client.query("SELECT id FROM marketing_campaigns WHERE coupon_code = $1", [code]);
      if (existing.rows[0]) throw new ConflictException("Este código de cupom já está em uso.");
      const campaignId = randomUUID();
      const campaign = await client.query(`
        INSERT INTO marketing_campaigns (
          id, name, coupon_code, description, discount_type, discount_value,
          max_discount_cents, min_amount_cents, total_redemption_limit,
          per_customer_limit, starts_at, ends_at, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', $13)
        RETURNING
          id, name, coupon_code AS code, description, discount_type AS "discountType",
          discount_value AS "discountValue", max_discount_cents AS "maxDiscountCents",
          min_amount_cents AS "minAmountCents", total_redemption_limit AS "totalRedemptionLimit",
          per_customer_limit AS "perCustomerLimit", starts_at AS "startsAt",
          ends_at AS "endsAt", status, created_at AS "createdAt", updated_at AS "updatedAt"
      `, [
        campaignId,
        input.name.trim(),
        code,
        input.description.trim(),
        input.discountType,
        input.discountValue,
        input.discountType === "percentage" ? input.maxDiscountCents : null,
        input.minAmountCents,
        input.totalRedemptionLimit,
        input.perCustomerLimit,
        startsAt,
        endsAt,
        actor.id,
      ]);
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO marketing_campaign_events (
          id, campaign_id, actor_id, event_type, to_status, note
        ) VALUES ($1, $2, $3, 'created', 'active', $4)
      `, [eventId, campaignId, actor.id, note]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'marketing_campaign.created', 'marketing_campaign', $3, $4::jsonb)",
        [actor.id, actor.role, campaignId, JSON.stringify({ couponCode: code, eventId })],
      );
      return campaign.rows[0];
    });
  }

  async changeStatus(actor: Actor, campaignId: string, action: "activate" | "pause", rawNote: string) {
    this.ensureOperation(actor);
    const note = this.normalizeNote(rawNote);
    return this.database.withActor(actor, async (client) => {
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
        usage.total_usage AS "totalUsage",
        usage.customer_usage AS "customerUsage"
      FROM marketing_campaigns campaign
      CROSS JOIN LATERAL marketing_campaign_usage(campaign.id, $2) usage
      WHERE campaign.coupon_code = $1
        AND campaign.status = 'active'
        AND campaign.starts_at <= now()
        AND campaign.ends_at > now()
    `, [code, customerId]);
    return result.rows[0] ?? null;
  }

  private ensureLimits(offer: CampaignOffer) {
    if (offer.totalUsage >= offer.totalRedemptionLimit) {
      throw new ConflictException("Este cupom atingiu o limite total de usos.");
    }
    if (offer.customerUsage >= offer.perCustomerLimit) {
      throw new ConflictException("Este cupom já atingiu o limite para a sua conta.");
    }
  }

  private publicOffer(offer: CampaignOffer) {
    return {
      name: offer.name,
      code: offer.code,
      description: offer.description,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      maxDiscountCents: offer.maxDiscountCents,
      minAmountCents: offer.minAmountCents,
      endsAt: offer.endsAt,
    };
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
