import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import {
  contextualAdNextStatus,
  type ContextualAdAction,
  type ContextualAdStatus,
} from "./advertising-rules.js";
import type {
  ContextualAdQueryDto,
  CreateContextualAdCampaignDto,
} from "./advertising.dto.js";

interface CampaignRow {
  id: string;
  publicCode: string;
  advertiserId: string;
  advertiserName: string;
  name: string;
  headline: string;
  body: string;
  ctaLabel: string;
  destinationUrl: string;
  targetCategoryId: string | null;
  targetCategoryName: string | null;
  targetRegionId: string | null;
  targetRegionName: string | null;
  startsAt: Date;
  endsAt: Date;
  impressionLimit: number;
  status: ContextualAdStatus;
  policyVersion: string;
  impressionCount: number;
  clickCount: number;
  latestEventNote: string | null;
  latestEventAt: Date | null;
  latestActorName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AdvertisingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async deliver(actor: Actor, context: ContextualAdQueryDto) {
    this.ensureCustomer(actor);
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<CampaignRow>(`
        SELECT
          campaign.id,
          campaign.public_code AS "publicCode",
          campaign.advertiser_id AS "advertiserId",
          profile.brand_name AS "advertiserName",
          campaign.name,
          campaign.headline,
          campaign.body,
          campaign.cta_label AS "ctaLabel",
          campaign.destination_url AS "destinationUrl",
          campaign.target_category_id AS "targetCategoryId",
          category.name AS "targetCategoryName",
          campaign.target_region_id AS "targetRegionId",
          region.name AS "targetRegionName",
          campaign.starts_at AS "startsAt",
          campaign.ends_at AS "endsAt",
          campaign.impression_limit AS "impressionLimit",
          campaign.status,
          campaign.policy_version AS "policyVersion",
          usage.impression_count AS "impressionCount",
          usage.click_count AS "clickCount",
          NULL::text AS "latestEventNote",
          NULL::timestamptz AS "latestEventAt",
          NULL::text AS "latestActorName",
          campaign.created_at AS "createdAt",
          campaign.updated_at AS "updatedAt"
        FROM contextual_ad_campaigns campaign
        JOIN advertiser_profiles profile ON profile.user_id = campaign.advertiser_id
        LEFT JOIN service_categories category ON category.id = campaign.target_category_id
        LEFT JOIN service_regions region ON region.id = campaign.target_region_id
        CROSS JOIN LATERAL contextual_ad_usage(campaign.id) usage
        WHERE campaign.status = 'approved'
          AND profile.status = 'active'
          AND campaign.starts_at <= now()
          AND campaign.ends_at > now()
          AND usage.impression_count < campaign.impression_limit
          AND (campaign.target_category_id IS NULL OR campaign.target_category_id = $1)
          AND (campaign.target_region_id IS NULL OR campaign.target_region_id = $2)
        ORDER BY
          ((campaign.target_category_id IS NOT NULL)::int
            + (campaign.target_region_id IS NOT NULL)::int) DESC,
          usage.impression_count ASC,
          campaign.created_at DESC
        LIMIT 1
      `, [context.categoryId, context.regionId]);
      const campaign = result.rows[0];
      if (!campaign) return { ad: null };

      const deliveryToken = randomBytes(32).toString("base64url");
      await client.query(`
        INSERT INTO contextual_ad_deliveries (
          id,
          campaign_id,
          delivery_token_hash,
          context_category_id,
          context_region_id
        )
        VALUES ($1, $2, $3, $4, $5)
      `, [
        randomUUID(),
        campaign.id,
        hashDeliveryToken(deliveryToken),
        context.categoryId,
        context.regionId,
      ]);
      return {
        ad: {
          id: campaign.id,
          publicCode: campaign.publicCode,
          advertiserName: campaign.advertiserName,
          headline: campaign.headline,
          body: campaign.body,
          ctaLabel: campaign.ctaLabel,
          deliveryToken,
          disclosure: "Patrocinado",
          whyShown: this.whyShown(campaign),
          policyVersion: campaign.policyVersion,
        },
      };
    });
  }

  async trackClick(actor: Actor, deliveryToken: string) {
    this.ensureCustomer(actor);
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<{ destinationUrl: string }>(`
        SELECT destination_url AS "destinationUrl"
        FROM contextual_ad_track_click($1)
      `, [hashDeliveryToken(deliveryToken)]);
      const click = result.rows[0];
      if (!click) throw new NotFoundException("Este anúncio não está mais disponível.");
      return { destinationUrl: click.destinationUrl };
    });
  }

  async listForAdvertiser(actor: Actor) {
    this.ensureAdvertiser(actor);
    return this.database.withActor(actor, async (client) => {
      const profile = await client.query<{
        brandName: string;
        websiteUrl: string;
        status: "active" | "suspended";
      }>(`
        SELECT
          brand_name AS "brandName",
          website_url AS "websiteUrl",
          status
        FROM advertiser_profiles
        WHERE user_id = $1
      `, [actor.id]);
      if (!profile.rows[0]) throw new NotFoundException("Perfil de anunciante não encontrado.");
      const campaigns = await this.campaignRows(client, actor.id);
      return {
        profile: profile.rows[0],
        metrics: this.metrics(campaigns),
        campaigns: campaigns.map((campaign) => this.presentCampaign(campaign)),
      };
    });
  }

  async listForOperation(actor: Actor) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const campaigns = await this.campaignRows(client);
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
      return {
        policy: {
          version: "CONTEXTUAL-ADS-2026-01",
          selectionBasis: "Somente categoria e região do pedido atual.",
          behavioralProfiling: false,
          rawViewerIdentityStored: false,
          deliveryRetentionDays: 30,
        },
        metrics: this.metrics(campaigns),
        campaigns: campaigns.map((campaign) => this.presentCampaign(campaign)),
        catalog: { categories: categories.rows, regions: regions.rows },
      };
    });
  }

  async create(
    actor: Actor,
    input: CreateContextualAdCampaignDto,
    idempotencyKey: string | undefined,
  ) {
    this.ensureAdvertiser(actor);
    const normalized = this.normalizeCreate(input);
    return this.database.withActor(actor, async (client) => {
      const profile = await client.query<{ status: "active" | "suspended" }>(
        "SELECT status FROM advertiser_profiles WHERE user_id = $1",
        [actor.id],
      );
      if (!profile.rows[0]) throw new NotFoundException("Perfil de anunciante não encontrado.");
      if (profile.rows[0].status !== "active") {
        throw new ForbiddenException("O perfil está suspenso para novas campanhas.");
      }
      await this.ensureActiveTarget(client, "category", normalized.targetCategoryId);
      await this.ensureActiveTarget(client, "region", normalized.targetRegionId);
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: "/api/v1/advertiser/campaigns",
        payload: normalized,
      }, async () => {
        const campaignId = randomUUID();
        const publicCode = `ADS-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
        const campaign = await client.query(`
          INSERT INTO contextual_ad_campaigns (
            id,
            public_code,
            advertiser_id,
            name,
            headline,
            body,
            cta_label,
            destination_url,
            target_category_id,
            target_region_id,
            starts_at,
            ends_at,
            impression_limit,
            status
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            'pending_review'
          )
          RETURNING
            id,
            public_code AS "publicCode",
            name,
            headline,
            status,
            policy_version AS "policyVersion",
            created_at AS "createdAt"
        `, [
          campaignId,
          publicCode,
          actor.id,
          normalized.name,
          normalized.headline,
          normalized.body,
          normalized.ctaLabel,
          normalized.destinationUrl,
          normalized.targetCategoryId,
          normalized.targetRegionId,
          normalized.startsAt,
          normalized.endsAt,
          normalized.impressionLimit,
        ]);
        const eventId = randomUUID();
        await client.query(`
          INSERT INTO contextual_ad_moderation_events (
            id,
            campaign_id,
            actor_id,
            actor_role,
            event_type,
            to_status,
            note
          )
          VALUES ($1, $2, $3, $4, 'submitted', 'pending_review', $5)
        `, [eventId, campaignId, actor.id, actor.role, normalized.note]);
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'contextual_ad.submitted', 'contextual_ad_campaign', $3, $4::jsonb)",
          [actor.id, actor.role, campaignId, JSON.stringify({
            publicCode,
            eventId,
            targetCategoryId: normalized.targetCategoryId,
            targetRegionId: normalized.targetRegionId,
            policyVersion: "CONTEXTUAL-ADS-2026-01",
          })],
        );
        return campaign.rows[0];
      });
    });
  }

  async moderate(
    actor: Actor,
    campaignId: string,
    action: ContextualAdAction,
    rawNote: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const note = this.normalizeNote(rawNote);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/advertising/${campaignId}/actions`,
        payload: { action, note },
      }, async () => {
        const current = await client.query<{
          id: string;
          publicCode: string;
          status: ContextualAdStatus;
          endsAt: Date;
        }>(`
          SELECT
            id,
            public_code AS "publicCode",
            status,
            ends_at AS "endsAt"
          FROM contextual_ad_campaigns
          WHERE id = $1
          FOR UPDATE
        `, [campaignId]);
        const row = current.rows[0];
        if (!row) throw new NotFoundException("Campanha publicitária não encontrada.");
        const nextStatus = contextualAdNextStatus(row.status, action);
        if (!nextStatus) {
          throw new ConflictException("Esta ação não é permitida no estado atual da campanha.");
        }
        if (nextStatus === "approved" && row.endsAt <= new Date()) {
          throw new ConflictException("Campanhas encerradas não podem ser ativadas.");
        }
        const updated = await client.query(`
          UPDATE contextual_ad_campaigns
          SET
            status = $2,
            reviewed_by = CASE
              WHEN $3 IN ('approve', 'reject') THEN $4::uuid
              ELSE reviewed_by
            END,
            reviewed_at = CASE
              WHEN $3 IN ('approve', 'reject') THEN now()
              ELSE reviewed_at
            END,
            updated_at = now()
          WHERE id = $1
          RETURNING
            id,
            public_code AS "publicCode",
            status,
            reviewed_at AS "reviewedAt",
            updated_at AS "updatedAt"
        `, [campaignId, nextStatus, action, actor.id]);
        const eventId = randomUUID();
        await client.query(`
          INSERT INTO contextual_ad_moderation_events (
            id,
            campaign_id,
            actor_id,
            actor_role,
            event_type,
            from_status,
            to_status,
            note
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          eventId,
          campaignId,
          actor.id,
          actor.role,
          action === "approve" ? "approved"
            : action === "reject" ? "rejected"
              : action === "pause" ? "paused"
                : "activated",
          row.status,
          nextStatus,
          note,
        ]);
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'contextual_ad.moderated', 'contextual_ad_campaign', $3, $4::jsonb)",
          [actor.id, actor.role, campaignId, JSON.stringify({
            publicCode: row.publicCode,
            from: row.status,
            to: nextStatus,
            action,
            eventId,
          })],
        );
        return updated.rows[0];
      });
    });
  }

  private async campaignRows(client: PoolClient, advertiserId?: string) {
    const result = await client.query<CampaignRow>(`
      SELECT
        campaign.id,
        campaign.public_code AS "publicCode",
        campaign.advertiser_id AS "advertiserId",
        profile.brand_name AS "advertiserName",
        campaign.name,
        campaign.headline,
        campaign.body,
        campaign.cta_label AS "ctaLabel",
        campaign.destination_url AS "destinationUrl",
        campaign.target_category_id AS "targetCategoryId",
        category.name AS "targetCategoryName",
        campaign.target_region_id AS "targetRegionId",
        region.name AS "targetRegionName",
        campaign.starts_at AS "startsAt",
        campaign.ends_at AS "endsAt",
        campaign.impression_limit AS "impressionLimit",
        campaign.status,
        campaign.policy_version AS "policyVersion",
        count(delivery.id)::int AS "impressionCount",
        count(delivery.id) FILTER (WHERE delivery.clicked_at IS NOT NULL)::int AS "clickCount",
        latest_event.note AS "latestEventNote",
        latest_event.created_at AS "latestEventAt",
        latest_actor.display_name AS "latestActorName",
        campaign.created_at AS "createdAt",
        campaign.updated_at AS "updatedAt"
      FROM contextual_ad_campaigns campaign
      JOIN advertiser_profiles profile ON profile.user_id = campaign.advertiser_id
      LEFT JOIN service_categories category ON category.id = campaign.target_category_id
      LEFT JOIN service_regions region ON region.id = campaign.target_region_id
      LEFT JOIN contextual_ad_deliveries delivery ON delivery.campaign_id = campaign.id
      LEFT JOIN LATERAL (
        SELECT event.actor_id, event.note, event.created_at
        FROM contextual_ad_moderation_events event
        WHERE event.campaign_id = campaign.id
        ORDER BY event.created_at DESC, event.id DESC
        LIMIT 1
      ) latest_event ON true
      LEFT JOIN users latest_actor ON latest_actor.id = latest_event.actor_id
      WHERE ($1::uuid IS NULL OR campaign.advertiser_id = $1)
      GROUP BY
        campaign.id,
        profile.brand_name,
        category.name,
        region.name,
        latest_event.note,
        latest_event.created_at,
        latest_actor.display_name
      ORDER BY campaign.created_at DESC, campaign.id DESC
    `, [advertiserId ?? null]);
    return result.rows;
  }

  private presentCampaign(campaign: CampaignRow) {
    return {
      ...campaign,
      clickThroughRate: campaign.impressionCount > 0
        ? Math.round((campaign.clickCount / campaign.impressionCount) * 1000) / 10
        : 0,
      targetingLabel: [
        campaign.targetCategoryName ?? "todas as categorias",
        campaign.targetRegionName ?? "todas as regiões",
      ].join(" · "),
    };
  }

  private metrics(campaigns: CampaignRow[]) {
    const impressionCount = campaigns.reduce((sum, campaign) => sum + campaign.impressionCount, 0);
    const clickCount = campaigns.reduce((sum, campaign) => sum + campaign.clickCount, 0);
    return {
      totalCount: campaigns.length,
      pendingCount: campaigns.filter((campaign) => campaign.status === "pending_review").length,
      liveCount: campaigns.filter((campaign) => (
        campaign.status === "approved"
        && campaign.startsAt <= new Date()
        && campaign.endsAt > new Date()
      )).length,
      impressionCount,
      clickCount,
      clickThroughRate: impressionCount > 0
        ? Math.round((clickCount / impressionCount) * 1000) / 10
        : 0,
    };
  }

  private normalizeCreate(input: CreateContextualAdCampaignDto) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException("O fim da campanha deve ocorrer depois do início.");
    if (endsAt <= new Date()) throw new BadRequestException("A campanha precisa terminar no futuro.");
    return {
      name: input.name.trim(),
      headline: input.headline.trim(),
      body: input.body.trim(),
      ctaLabel: input.ctaLabel.trim(),
      destinationUrl: this.normalizeDestination(input.destinationUrl),
      targetCategoryId: input.targetCategoryId ?? null,
      targetRegionId: input.targetRegionId ?? null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      impressionLimit: input.impressionLimit,
      note: this.normalizeNote(input.note),
    };
  }

  private normalizeDestination(value: string) {
    let destination: URL;
    try {
      destination = new URL(value);
    } catch {
      throw new BadRequestException("Informe um endereço HTTPS válido.");
    }
    if (destination.protocol !== "https:" || destination.username || destination.password) {
      throw new BadRequestException("O destino deve usar HTTPS e não pode conter credenciais.");
    }
    return destination.toString();
  }

  private normalizeNote(value: string) {
    const note = value.trim();
    if (note.length < 10 || note.length > 1000) {
      throw new BadRequestException("A justificativa deve ter entre 10 e 1000 caracteres.");
    }
    return note;
  }

  private async ensureActiveTarget(
    client: PoolClient,
    kind: "category" | "region",
    id: string | null,
  ) {
    if (!id) return;
    const result = await client.query(
      kind === "category"
        ? "SELECT id FROM service_categories WHERE id = $1 AND active = true"
        : "SELECT id FROM service_regions WHERE id = $1 AND active = true",
      [id],
    );
    if (!result.rows[0]) {
      throw new BadRequestException(
        kind === "category" ? "A categoria-alvo não está ativa." : "A região-alvo não está ativa.",
      );
    }
  }

  private whyShown(campaign: CampaignRow) {
    const context = [
      campaign.targetCategoryName ? `categoria ${campaign.targetCategoryName}` : null,
      campaign.targetRegionName ? `região ${campaign.targetRegionName}` : null,
    ].filter(Boolean).join(" e ");
    return context
      ? `Exibido pelo contexto atual: ${context}. Nenhum histórico pessoal foi usado.`
      : "Exibido de forma geral nesta etapa. Nenhum histórico pessoal foi usado.";
  }

  private ensureCustomer(actor: Actor) {
    if (actor.role !== "customer") throw new ForbiddenException("Somente clientes podem receber anúncios contextuais.");
  }

  private ensureAdvertiser(actor: Actor) {
    if (actor.role !== "advertiser") throw new ForbiddenException("Somente anunciantes podem gerir estas campanhas.");
  }

  private ensureOperation(actor: Actor) {
    if (actor.role !== "operation") throw new ForbiddenException("Somente a operação pode moderar anúncios.");
  }
}

function hashDeliveryToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
