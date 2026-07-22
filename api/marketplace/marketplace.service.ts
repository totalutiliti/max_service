import { randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import type { CreateProposalDto, CreateServiceRequestDto } from "./marketplace.dto.js";

interface ServiceRequestRow {
  id: string;
  publicCode: string;
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
}

@Injectable()
export class MarketplaceService {
  constructor(private readonly database: DatabaseService) {}

  async categories() {
    const result = await this.database.query<{
      id: string;
      slug: string;
      name: string;
      icon: string;
    }>("SELECT id, slug, name, icon FROM service_categories WHERE active = true ORDER BY sort_order, name");
    return result.rows;
  }

  async listRequests(actor: Actor) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<ServiceRequestRow>(`
        SELECT
          r.id,
          r.public_code AS "publicCode",
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
          COUNT(p.id)::int AS "proposalCount"
        FROM service_requests r
        JOIN service_categories c ON c.id = r.category_id
        LEFT JOIN proposals p ON p.request_id = r.id
        GROUP BY r.id, c.id
        ORDER BY r.created_at DESC
        LIMIT 50
      `);
      return result.rows;
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

      const id = randomUUID();
      const publicCode = `SV-${randomBytes(3).toString("hex").toUpperCase()}`;
      const created = await client.query<ServiceRequestRow>(`
        INSERT INTO service_requests (
          id, public_code, customer_id, category_id, title, description,
          neighborhood, city, state, preferred_window, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open')
        RETURNING
          id, public_code AS "publicCode", title, description, neighborhood, city,
          state, preferred_window AS "preferredWindow", status, created_at AS "createdAt"
      `, [id, publicCode, actor.id, category.rows[0].id, input.title, input.description, input.neighborhood, input.city, input.state.toUpperCase(), input.preferredWindow]);

      await client.query(
        "INSERT INTO request_status_history (request_id, status, actor_id, note) VALUES ($1, 'open', $2, $3)",
        [id, actor.id, "Solicitação criada pelo cliente."],
      );
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'service_request.created', 'service_request', $3, $4::jsonb)",
        [actor.id, actor.role, id, JSON.stringify({ publicCode, categorySlug: input.categorySlug })],
      );

      return created.rows[0];
    });
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
      const request = await client.query<{ id: string }>("SELECT id FROM service_requests WHERE id = $1", [requestId]);
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
      return result.rows[0];
    });
  }

  async acceptProposal(actor: Actor, proposalId: string) {
    if (actor.role !== "customer") throw new ForbiddenException("Somente o cliente pode aceitar uma proposta.");
    return this.database.withActor(actor, async (client) => {
      const accepted = await client.query<{ id: string; requestId: string }>(`
        UPDATE proposals p
        SET status = 'accepted', updated_at = now()
        WHERE p.id = $1
          AND EXISTS (SELECT 1 FROM service_requests r WHERE r.id = p.request_id AND r.customer_id = $2)
        RETURNING p.id, p.request_id AS "requestId"
      `, [proposalId, actor.id]);
      if (!accepted.rows[0]) throw new NotFoundException("Proposta não encontrada.");

      await client.query("UPDATE proposals SET status = 'declined', updated_at = now() WHERE request_id = $1 AND id <> $2", [accepted.rows[0].requestId, proposalId]);
      await client.query("UPDATE service_requests SET status = 'booked', updated_at = now() WHERE id = $1", [accepted.rows[0].requestId]);
      await client.query("INSERT INTO request_status_history (request_id, status, actor_id, note) VALUES ($1, 'booked', $2, 'Proposta aceita pelo cliente.')", [accepted.rows[0].requestId, actor.id]);
      return { proposalId, requestId: accepted.rows[0].requestId, status: "booked" };
    });
  }
}
