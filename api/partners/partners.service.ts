import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import type { InviteReferralDto } from "./partners.dto.js";

@Injectable()
export class PartnersService {
  constructor(private readonly database: DatabaseService) {}

  private ensurePartner(actor: Actor) {
    if (actor.role !== "partner") throw new ForbiddenException("Somente parceiros podem acessar esta rede.");
  }

  async dashboard(actor: Actor) {
    this.ensurePartner(actor);
    return this.database.withActor(actor, async (client) => {
      const link = await client.query(`
        SELECT id, referral_code AS "referralCode", slug, status, created_at AS "createdAt"
        FROM partner_referral_links
        WHERE partner_id = $1
      `, [actor.id]);
      if (!link.rows[0]) throw new NotFoundException("Link de indicação não encontrado.");

      const referrals = await client.query(`
        SELECT
          referral.id,
          referral.public_code AS "publicCode",
          referral.professional_name AS "professionalName",
          referral.email,
          referral.status,
          referral.source,
          referral.created_at AS "createdAt",
          referral.activated_at AS "activatedAt",
          category.name AS "categoryName",
          category.icon AS "categoryIcon",
          provider.public_code AS "providerCode"
        FROM partner_referrals referral
        JOIN service_categories category ON category.id = referral.service_category_id
        LEFT JOIN users provider ON provider.id = referral.provider_id
        WHERE referral.partner_id = $1
        ORDER BY referral.created_at DESC, referral.id DESC
      `, [actor.id]);
      const metrics = await client.query(`
        SELECT
          count(*)::int AS "totalCount",
          count(*) FILTER (WHERE status = 'active')::int AS "activeCount",
          count(*) FILTER (WHERE status IN ('invited', 'in_review'))::int AS "pendingCount",
          CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE status = 'active') / count(*))::int END AS "activationRate"
        FROM partner_referrals
        WHERE partner_id = $1
      `, [actor.id]);
      return { link: link.rows[0], metrics: metrics.rows[0], referrals: referrals.rows };
    });
  }

  async invite(actor: Actor, input: InviteReferralDto) {
    this.ensurePartner(actor);
    const professionalName = input.professionalName.trim();
    const email = input.email.trim().toLowerCase();
    return this.database.withActor(actor, async (client) => {
      const context = await client.query<{ linkId: string; categoryId: string }>(`
        SELECT link.id AS "linkId", category.id AS "categoryId"
        FROM partner_referral_links link
        CROSS JOIN service_categories category
        WHERE link.partner_id = $1 AND link.status = 'active'
          AND category.slug = $2 AND category.active = true
      `, [actor.id, input.categorySlug]);
      if (!context.rows[0]) throw new NotFoundException("Link ou categoria de indicação indisponível.");

      const id = randomUUID();
      const publicCode = `RF-${randomBytes(2).toString("hex").toUpperCase()}`;
      const result = await client.query(`
        INSERT INTO partner_referrals (
          id, public_code, referral_link_id, partner_id, service_category_id,
          professional_name, email, status, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'invited', 'manual')
        ON CONFLICT (partner_id, lower(email)) DO NOTHING
        RETURNING id, public_code AS "publicCode", professional_name AS "professionalName", email, status, source, created_at AS "createdAt"
      `, [id, publicCode, context.rows[0].linkId, actor.id, context.rows[0].categoryId, professionalName, email]);
      if (!result.rows[0]) throw new ConflictException("Este profissional já está na sua rede de indicações.");
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'partner_referral.invited', 'partner_referral', $3, $4::jsonb)",
        [actor.id, actor.role, id, JSON.stringify({ publicCode, categorySlug: input.categorySlug })],
      );
      return result.rows[0];
    });
  }
}
