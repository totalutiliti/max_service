import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import type { CompleteOnboardingDto } from "./onboarding.dto.js";

type OnboardingRole = "customer" | "provider";

interface LegalDocumentRow {
  id: string;
  documentType: "terms_of_use" | "privacy_notice" | "provider_code";
  version: string;
  title: string;
  summary: string;
  content: string;
  contentSha256: string;
  approvalStatus: "draft" | "approved";
  effectiveAt: string;
  acceptedAt: string | null;
}

@Injectable()
export class OnboardingService {
  constructor(private readonly database: DatabaseService) {}

  async view(actor: Actor) {
    const role = this.requireOnboardingRole(actor);
    return this.database.withActor(actor, (client) => this.loadView(client, actor, role));
  }

  async complete(actor: Actor, input: CompleteOnboardingDto) {
    const role = this.requireOnboardingRole(actor);
    const profile = this.normalizeProfile(role, input);
    return this.database.withActor(actor, async (client) => {
      const documentsResult = await client.query<LegalDocumentRow>(`
        SELECT
          document.id,
          document.document_type AS "documentType",
          document.version,
          document.title,
          document.summary,
          document.content,
          document.content_sha256 AS "contentSha256",
          document.approval_status AS "approvalStatus",
          document.effective_at AS "effectiveAt",
          NULL::timestamptz AS "acceptedAt"
        FROM legal_documents document
        WHERE document.audience = $1 AND document.status = 'active'
        ORDER BY document.document_type
      `, [role]);
      const documents = documentsResult.rows;
      const acceptedIds = new Set(input.acceptedDocumentIds);
      if (
        documents.length === 0
        || documents.some((document) => !acceptedIds.has(document.id))
        || [...acceptedIds].some((id) => !documents.some((document) => document.id === id))
      ) {
        throw new BadRequestException("Aceite todos e somente os documentos vigentes para continuar.");
      }
      const privacyDocument = documents.find((document) => document.documentType === "privacy_notice");
      if (!privacyDocument) throw new BadRequestException("Aviso de privacidade vigente não encontrado.");

      if (role === "provider") {
        const category = await client.query<{ id: string }>(
          "SELECT id FROM service_categories WHERE id = $1 AND active = true",
          [profile.serviceCategoryId],
        );
        if (!category.rows[0]) throw new BadRequestException("Selecione uma categoria ativa do piloto.");
      }

      const resolvedProfile = await this.resolveProfileLocation(client, role, profile);
      const currentResult = await client.query<{ version: number }>(
        "SELECT version FROM onboarding_profiles WHERE user_id = $1 FOR UPDATE",
        [actor.id],
      );
      const current = currentResult.rows[0];
      const nextVersion = (current?.version ?? 0) + 1;
      const updated = await client.query(`
        INSERT INTO onboarding_profiles (
          user_id, profile_type, city, state, neighborhood, service_category_id,
          years_experience, service_radius_km, bio, availability_summary,
          region_id, neighborhood_id, version, completed_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          neighborhood = EXCLUDED.neighborhood,
          service_category_id = EXCLUDED.service_category_id,
          years_experience = EXCLUDED.years_experience,
          service_radius_km = EXCLUDED.service_radius_km,
          bio = EXCLUDED.bio,
          availability_summary = EXCLUDED.availability_summary,
          region_id = EXCLUDED.region_id,
          neighborhood_id = EXCLUDED.neighborhood_id,
          version = EXCLUDED.version,
          completed_at = now(),
          updated_at = now()
        RETURNING version
      `, [
        actor.id,
        role,
        resolvedProfile.city,
        resolvedProfile.state,
        resolvedProfile.neighborhood,
        resolvedProfile.serviceCategoryId,
        resolvedProfile.yearsExperience,
        resolvedProfile.serviceRadiusKm,
        resolvedProfile.bio,
        resolvedProfile.availabilitySummary,
        resolvedProfile.regionId,
        resolvedProfile.neighborhoodId,
        nextVersion,
      ]);
      if (!updated.rows[0]) throw new ConflictException("Não foi possível salvar o onboarding.");

      if (role === "provider") {
        await this.syncProviderRegions(client, actor, resolvedProfile.serviceRegionIds);
      }

      for (const document of documents) {
        await client.query(`
          INSERT INTO legal_acceptances (
            id, document_id, user_id, document_sha256, source
          ) VALUES ($1, $2, $3, $4, 'onboarding')
          ON CONFLICT (document_id, user_id) DO NOTHING
        `, [randomUUID(), document.id, actor.id, document.contentSha256]);
      }

      await this.upsertConsent(
        client,
        actor,
        "marketing_communications",
        input.marketingConsent,
        privacyDocument.id,
      );
      await this.upsertConsent(
        client,
        actor,
        "product_research",
        input.productResearchConsent,
        privacyDocument.id,
      );

      const eventId = randomUUID();
      await client.query(`
        INSERT INTO onboarding_events (
          id, user_id, actor_id, event_type, profile_version,
          accepted_document_ids, profile_snapshot
        ) VALUES ($1, $2, $2, $3, $4, $5::jsonb, $6::jsonb)
      `, [
        eventId,
        actor.id,
        current ? "updated" : "completed",
        nextVersion,
        JSON.stringify(documents.map((document) => document.id)),
        JSON.stringify({
          profileType: role,
          state: resolvedProfile.state,
          regionId: resolvedProfile.regionId,
          neighborhoodId: resolvedProfile.neighborhoodId,
          serviceRegionIds: resolvedProfile.serviceRegionIds,
          serviceCategoryId: resolvedProfile.serviceCategoryId,
          yearsExperience: resolvedProfile.yearsExperience,
          serviceRadiusKm: resolvedProfile.serviceRadiusKm,
        }),
      ]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, $3, 'onboarding_profile', $4, $5::jsonb)",
        [
          actor.id,
          actor.role,
          current ? "onboarding.updated" : "onboarding.completed",
          eventId,
          JSON.stringify({
            profileVersion: nextVersion,
            documentVersions: documents.map((document) => `${document.documentType}:${document.version}`),
          }),
        ],
      );

      return this.loadView(client, actor, role);
    });
  }

  private requireOnboardingRole(actor: Actor): OnboardingRole {
    if (actor.role !== "customer" && actor.role !== "provider") {
      throw new ForbiddenException("O onboarding está disponível somente para cliente e profissional.");
    }
    return actor.role;
  }

  private normalizeProfile(role: OnboardingRole, input: CompleteOnboardingDto) {
    if (role === "customer") {
      if (!input.regionId || !input.neighborhoodId) {
        throw new BadRequestException("Selecione a região e o bairro de atendimento.");
      }
      return {
        regionId: input.regionId,
        neighborhoodId: input.neighborhoodId,
        serviceRegionIds: [] as string[],
        serviceCategoryId: null,
        yearsExperience: null,
        serviceRadiusKm: null,
        bio: null,
        availabilitySummary: null,
      };
    }
    const bio = input.bio?.trim() ?? "";
    const availabilitySummary = input.availabilitySummary?.trim() ?? "";
    const serviceRegionIds = [...new Set(input.serviceRegionIds ?? [])];
    if (
      !input.serviceCategoryId
      || serviceRegionIds.length === 0
      || serviceRegionIds.length > 5
      || input.yearsExperience === undefined
      || input.serviceRadiusKm === undefined
      || bio.length < 20
      || availabilitySummary.length < 5
    ) {
      throw new BadRequestException("Complete regiões, categoria, experiência, raio, apresentação e disponibilidade.");
    }
    return {
      regionId: serviceRegionIds[0],
      neighborhoodId: null,
      serviceRegionIds,
      serviceCategoryId: input.serviceCategoryId,
      yearsExperience: input.yearsExperience,
      serviceRadiusKm: input.serviceRadiusKm,
      bio,
      availabilitySummary,
    };
  }

  private async resolveProfileLocation(
    client: PoolClient,
    role: OnboardingRole,
    profile: ReturnType<OnboardingService["normalizeProfile"]>,
  ) {
    if (role === "customer") {
      const location = await client.query<{
        regionId: string;
        neighborhoodId: string;
        city: string;
        state: string;
        neighborhood: string;
      }>(`
        SELECT
          region.id AS "regionId",
          neighborhood.id AS "neighborhoodId",
          region.city,
          region.state,
          neighborhood.name AS neighborhood
        FROM service_regions region
        JOIN service_region_neighborhoods neighborhood
          ON neighborhood.region_id = region.id
        WHERE region.id = $1
          AND neighborhood.id = $2
          AND region.active = true
          AND neighborhood.active = true
      `, [profile.regionId, profile.neighborhoodId]);
      if (!location.rows[0]) {
        throw new BadRequestException("A região ou o bairro selecionado não está disponível.");
      }
      return { ...profile, ...location.rows[0] };
    }

    const regions = await client.query<{ id: string; city: string; state: string }>(`
      SELECT id, city, state
      FROM service_regions
      WHERE id = ANY($1::uuid[]) AND active = true
    `, [profile.serviceRegionIds]);
    if (regions.rows.length !== profile.serviceRegionIds.length) {
      throw new BadRequestException("Selecione somente regiões ativas do piloto.");
    }
    const primary = regions.rows.find((region) => region.id === profile.regionId);
    if (!primary) throw new BadRequestException("Região principal indisponível.");
    return {
      ...profile,
      city: primary.city,
      state: primary.state,
      neighborhood: null,
    };
  }

  private async syncProviderRegions(client: PoolClient, actor: Actor, regionIds: string[]) {
    const currentResult = await client.query<{ regionId: string; active: boolean }>(`
      SELECT region_id AS "regionId", active
      FROM provider_service_regions
      WHERE provider_id = $1
      FOR UPDATE
    `, [actor.id]);
    const current = new Map(currentResult.rows.map((coverage) => [coverage.regionId, coverage.active]));
    const selected = new Set(regionIds);

    for (const coverage of currentResult.rows) {
      if (coverage.active && !selected.has(coverage.regionId)) {
        await client.query(`
          UPDATE provider_service_regions
          SET active = false, source = 'onboarding', updated_at = now()
          WHERE provider_id = $1 AND region_id = $2
        `, [actor.id, coverage.regionId]);
        await client.query(`
          INSERT INTO provider_service_region_events (
            id, provider_id, region_id, actor_id, event_type, source
          ) VALUES ($1, $2, $3, $2, 'removed', 'onboarding')
        `, [randomUUID(), actor.id, coverage.regionId]);
      }
    }
    for (const regionId of regionIds) {
      await client.query(`
        INSERT INTO provider_service_regions (
          provider_id, region_id, source, active
        ) VALUES ($1, $2, 'onboarding', true)
        ON CONFLICT (provider_id, region_id) DO UPDATE SET
          source = 'onboarding',
          active = true,
          updated_at = now()
      `, [actor.id, regionId]);
      if (current.get(regionId) !== true) {
        await client.query(`
          INSERT INTO provider_service_region_events (
            id, provider_id, region_id, actor_id, event_type, source
          ) VALUES ($1, $2, $3, $2, 'added', 'onboarding')
        `, [randomUUID(), actor.id, regionId]);
      }
    }
  }

  private async upsertConsent(
    client: PoolClient,
    actor: Actor,
    purpose: "marketing_communications" | "product_research",
    granted: boolean,
    privacyDocumentId: string,
  ) {
    const current = await client.query<{ granted: boolean }>(
      "SELECT granted FROM consent_preferences WHERE user_id = $1 AND purpose = $2 FOR UPDATE",
      [actor.id, purpose],
    );
    await client.query(`
      INSERT INTO consent_preferences (
        user_id, purpose, granted, privacy_document_id, source, updated_at
      ) VALUES ($1, $2, $3, $4, 'onboarding', now())
      ON CONFLICT (user_id, purpose) DO UPDATE SET
        granted = EXCLUDED.granted,
        privacy_document_id = EXCLUDED.privacy_document_id,
        source = EXCLUDED.source,
        updated_at = now()
    `, [actor.id, purpose, granted, privacyDocumentId]);
    if (!current.rows[0] || current.rows[0].granted !== granted) {
      await client.query(`
        INSERT INTO consent_events (
          id, user_id, actor_id, purpose, previous_granted,
          granted, privacy_document_id, source
        ) VALUES ($1, $2, $2, $3, $4, $5, $6, 'onboarding')
      `, [
        randomUUID(),
        actor.id,
        purpose,
        current.rows[0]?.granted ?? null,
        granted,
        privacyDocumentId,
      ]);
    }
  }

  private async loadView(client: PoolClient, actor: Actor, role: OnboardingRole) {
    const documents = await client.query<LegalDocumentRow>(`
      SELECT
        document.id,
        document.document_type AS "documentType",
        document.version,
        document.title,
        document.summary,
        document.content,
        document.content_sha256 AS "contentSha256",
        document.approval_status AS "approvalStatus",
        document.effective_at AS "effectiveAt",
        acceptance.accepted_at AS "acceptedAt"
      FROM legal_documents document
      LEFT JOIN legal_acceptances acceptance
        ON acceptance.document_id = document.id AND acceptance.user_id = $2
      WHERE document.audience = $1 AND document.status = 'active'
      ORDER BY document.document_type
    `, [role, actor.id]);
    const profileResult = await client.query<{
      profileType: OnboardingRole;
      regionId: string;
      neighborhoodId: string | null;
      city: string;
      state: string;
      neighborhood: string | null;
      serviceCategoryId: string | null;
      serviceCategoryName: string | null;
      serviceCategoryIcon: string | null;
      yearsExperience: number | null;
      serviceRadiusKm: number | null;
      bio: string | null;
      availabilitySummary: string | null;
      version: number;
      completedAt: string;
      updatedAt: string;
    }>(`
      SELECT
        profile.profile_type AS "profileType",
        profile.region_id AS "regionId",
        profile.neighborhood_id AS "neighborhoodId",
        profile.city,
        profile.state,
        profile.neighborhood,
        profile.service_category_id AS "serviceCategoryId",
        category.name AS "serviceCategoryName",
        category.icon AS "serviceCategoryIcon",
        profile.years_experience AS "yearsExperience",
        profile.service_radius_km AS "serviceRadiusKm",
        profile.bio,
        profile.availability_summary AS "availabilitySummary",
        profile.version,
        profile.completed_at AS "completedAt",
        profile.updated_at AS "updatedAt"
      FROM onboarding_profiles profile
      LEFT JOIN service_categories category ON category.id = profile.service_category_id
      WHERE profile.user_id = $1
    `, [actor.id]);
    const consents = await client.query<{
      purpose: "marketing_communications" | "product_research";
      granted: boolean;
      updatedAt: string;
    }>(`
      SELECT purpose, granted, updated_at AS "updatedAt"
      FROM consent_preferences
      WHERE user_id = $1
      ORDER BY purpose
    `, [actor.id]);
    const categories = role === "provider"
      ? await client.query<{ id: string; name: string; icon: string }>(`
          SELECT id, name, icon
          FROM service_categories
          WHERE active = true
          ORDER BY sort_order, name
        `)
      : { rows: [] };
    const regions = await client.query<{
      id: string;
      code: string;
      name: string;
      city: string;
      state: string;
      selected: boolean;
      neighborhoods: Array<{ id: string; slug: string; name: string }>;
    }>(`
      SELECT
        region.id,
        region.code,
        region.name,
        region.city,
        region.state,
        EXISTS (
          SELECT 1
          FROM provider_service_regions coverage
          WHERE coverage.provider_id = $1
            AND coverage.region_id = region.id
            AND coverage.active = true
        ) AS selected,
        COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', neighborhood.id,
            'slug', neighborhood.slug,
            'name', neighborhood.name
          )
          ORDER BY neighborhood.sort_order, neighborhood.name
        ) FILTER (WHERE neighborhood.id IS NOT NULL), '[]'::jsonb) AS neighborhoods
      FROM service_regions region
      LEFT JOIN service_region_neighborhoods neighborhood
        ON neighborhood.region_id = region.id AND neighborhood.active = true
      WHERE region.active = true
      GROUP BY region.id
      HAVING count(neighborhood.id) > 0
      ORDER BY region.sort_order, region.name
    `, [actor.id]);
    const history = await client.query<{
      id: string;
      eventType: "completed" | "updated";
      profileVersion: number;
      createdAt: string;
    }>(`
      SELECT
        id,
        event_type AS "eventType",
        profile_version AS "profileVersion",
        created_at AS "createdAt"
      FROM onboarding_events
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 10
    `, [actor.id]);
    const preference = (purpose: "marketing_communications" | "product_research") =>
      consents.rows.find((consent) => consent.purpose === purpose)?.granted ?? false;
    return {
      status: profileResult.rows[0] ? "completed" : "pending",
      profile: profileResult.rows[0] ?? null,
      documents: documents.rows,
      consents: {
        marketingCommunications: preference("marketing_communications"),
        productResearch: preference("product_research"),
      },
      categories: categories.rows,
      regions: regions.rows,
      history: history.rows,
    };
  }
}
