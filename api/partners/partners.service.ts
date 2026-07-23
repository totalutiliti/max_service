import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import type { CapturePublicReferralDto, InviteReferralDto } from "./partners.dto.js";

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
    if (professionalName.length < 3) throw new BadRequestException("Informe o nome completo do profissional.");
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

  async publicDetails(rawCode: string) {
    const code = normalizeReferralCode(rawCode);
    return this.database.withPublicReferral(async (client) => {
      const link = await client.query<{ id: string; referralCode: string }>(`
        SELECT id, referral_code AS "referralCode"
        FROM partner_referral_links
        WHERE referral_code = $1 AND status = 'active'
      `, [code]);
      if (!link.rows[0]) throw new NotFoundException("Convite de parceiro indisponível.");

      const categories = await client.query(`
        SELECT slug, name, icon
        FROM service_categories
        WHERE active = true
        ORDER BY sort_order, name
      `);
      return {
        referralCode: link.rows[0].referralCode,
        privacyNoticeVersion: "pilot-2026-07",
        categories: categories.rows,
      };
    });
  }

  async capturePublic(rawCode: string, input: CapturePublicReferralDto) {
    const code = normalizeReferralCode(rawCode);
    const professionalName = input.professionalName.trim();
    const email = input.email.trim().toLowerCase();
    if (professionalName.length < 3) throw new BadRequestException("Informe seu nome completo.");

    return this.database.withPublicReferral(async (client) => {
      const link = await client.query<{ id: string; partnerId: string }>(`
        SELECT id, partner_id AS "partnerId"
        FROM partner_referral_links
        WHERE referral_code = $1 AND status = 'active'
      `, [code]);
      if (!link.rows[0]) throw new NotFoundException("Convite de parceiro indisponível.");
      await client.query("SELECT set_config('app.referral_link_id', $1, true)", [link.rows[0].id]);

      const existing = await client.query(`
        SELECT id
        FROM partner_referrals
        WHERE referral_link_id = $1 AND lower(email) = $2
      `, [link.rows[0].id, email]);
      if (existing.rows[0]) return { recorded: false };

      const recent = await client.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM partner_referrals
        WHERE referral_link_id = $1
          AND source IN ('link', 'qr')
          AND created_at >= now() - interval '15 minutes'
      `, [link.rows[0].id]);
      if ((recent.rows[0]?.count ?? 0) >= 8) {
        throw new HttpException("Muitas indicações recentes. Tente novamente em alguns minutos.", HttpStatus.TOO_MANY_REQUESTS);
      }

      const category = await client.query<{ id: string }>(`
        SELECT id
        FROM service_categories
        WHERE slug = $1 AND active = true
      `, [input.categorySlug]);
      if (!category.rows[0]) throw new NotFoundException("Categoria de serviço indisponível.");

      const result = await client.query(`
        INSERT INTO partner_referrals (
          id, public_code, referral_link_id, partner_id, service_category_id,
          professional_name, email, status, source, consent_at, privacy_notice_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'invited', $8, now(), 'pilot-2026-07')
        ON CONFLICT (partner_id, lower(email)) DO NOTHING
        RETURNING id
      `, [
        randomUUID(),
        `RF-${randomBytes(4).toString("hex").toUpperCase()}`,
        link.rows[0].id,
        link.rows[0].partnerId,
        category.rows[0].id,
        professionalName,
        email,
        input.source,
      ]);
      return { recorded: Boolean(result.rows[0]) };
    });
  }
}

function normalizeReferralCode(rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!/^PC-[A-Z0-9]{4,16}$/.test(code)) throw new NotFoundException("Convite de parceiro indisponível.");
  return code;
}
