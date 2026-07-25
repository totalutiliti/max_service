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
import { canonicalJson } from "../idempotency/idempotency.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import type {
  CreateDataSubjectRequestDto,
  TransitionDataSubjectRequestDto,
} from "./privacy.dto.js";

type SubjectRole = "customer" | "provider" | "partner" | "advertiser";
type RequestStatus = "open" | "in_review" | "awaiting_subject" | "fulfilled" | "denied";
type RequestType = "access" | "correction" | "deletion" | "restriction" | "consent_withdrawal";

interface DataSubjectRequestRow {
  [key: string]: unknown;
  id: string;
  publicCode: string;
  requestType: RequestType;
  status: RequestStatus;
  description: string;
  dueAt: string;
  version: number;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  subjectCode: string;
  subjectRole: SubjectRole;
  subjectName: string;
  assignedToName: string | null;
  exportCode: string | null;
  exportChecksum: string | null;
  exportGeneratedAt: string | null;
}

interface IdentityRow {
  publicCode: string;
  role: SubjectRole;
  displayName: string;
  email: string;
  createdAt: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requestSelect = `
  SELECT
    request.id,
    request.public_code AS "publicCode",
    request.request_type AS "requestType",
    request.status,
    request.description,
    request.due_at AS "dueAt",
    request.version,
    request.resolution_note AS "resolutionNote",
    request.created_at AS "createdAt",
    request.updated_at AS "updatedAt",
    request.completed_at AS "completedAt",
    subject.public_code AS "subjectCode",
    subject.role AS "subjectRole",
    subject.display_name AS "subjectName",
    assignee.display_name AS "assignedToName",
    receipt.public_code AS "exportCode",
    receipt.checksum AS "exportChecksum",
    receipt.generated_at AS "exportGeneratedAt"
  FROM data_subject_requests request
  JOIN users subject ON subject.id = request.subject_id
  LEFT JOIN users assignee ON assignee.id = request.assigned_to
  LEFT JOIN data_subject_export_receipts receipt ON receipt.request_id = request.id
`;

@Injectable()
export class PrivacyService {
  constructor(
    private readonly database: DatabaseService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async subjectCenter(actor: Actor) {
    this.requireSubject(actor);
    return this.database.withActor(actor, async (client) => {
      const [identity, requests, events] = await Promise.all([
        client.query<IdentityRow>(`
          SELECT
            public_code AS "publicCode",
            role,
            display_name AS "displayName",
            email,
            created_at AS "createdAt"
          FROM current_data_subject_identity()
        `),
        client.query<DataSubjectRequestRow>(`
          ${requestSelect}
          WHERE request.subject_id = $1
          ORDER BY request.created_at DESC, request.id DESC
          LIMIT 20
        `, [actor.id]),
        client.query<{
          id: string;
          requestId: string;
          requestCode: string;
          eventType: "created" | "status_changed" | "export_generated";
          fromStatus: RequestStatus | null;
          toStatus: RequestStatus;
          requestVersion: number;
          note: string;
          createdAt: string;
          actorRole: string;
        }>(`
          SELECT
            event.id,
            event.request_id AS "requestId",
            request.public_code AS "requestCode",
            event.event_type AS "eventType",
            event.from_status AS "fromStatus",
            event.to_status AS "toStatus",
            event.request_version AS "requestVersion",
            event.note,
            event.created_at AS "createdAt",
            actor.role AS "actorRole"
          FROM data_subject_request_events event
          JOIN data_subject_requests request ON request.id = event.request_id
          JOIN users actor ON actor.id = event.actor_id
          WHERE request.subject_id = $1
          ORDER BY event.created_at DESC, event.id DESC
          LIMIT 40
        `, [actor.id]),
      ]);
      if (!identity.rows[0]) throw new NotFoundException("Identidade do titular não encontrada.");
      return {
        policy: {
          version: "privacy-rights-pilot-1",
          operationalTargetDays: 15,
          physicalDeletionAutomatic: false,
          exportFormat: "application/json",
          notice: "A exclusão física e a anonimização dependem da política de retenção aprovada. O pedido e toda decisão permanecem auditáveis.",
        },
        subject: identity.rows[0],
        metrics: this.subjectMetrics(requests.rows),
        requests: requests.rows,
        history: events.rows,
      };
    });
  }

  async createRequest(
    actor: Actor,
    input: CreateDataSubjectRequestDto,
    idempotencyKey: string | undefined,
  ) {
    this.requireSubject(actor);
    const description = input.description.trim();
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: "/api/v1/privacy/requests",
        payload: { requestType: input.requestType, description, acknowledgement: input.acknowledgement },
      }, async () => {
        const id = randomUUID();
        const publicCode = this.publicCode("DS");
        await client.query(`
          INSERT INTO data_subject_requests (
            id, public_code, subject_id, request_type, description, due_at
          ) VALUES ($1, $2, $3, $4, $5, now() + interval '15 days')
        `, [id, publicCode, actor.id, input.requestType, description]);
        await client.query(`
          INSERT INTO data_subject_request_events (
            id, request_id, actor_id, event_type, to_status,
            request_version, note, snapshot
          ) VALUES ($1, $2, $3, 'created', 'open', 1, $4, $5::jsonb)
        `, [
          randomUUID(),
          id,
          actor.id,
          "Solicitação registrada pelo titular com confirmação explícita de ciência.",
          JSON.stringify({ requestType: input.requestType, operationalTargetDays: 15 }),
        ]);
        await client.query(`
          INSERT INTO audit_events (
            actor_id, actor_role, action, entity_type, entity_id, payload
          ) VALUES ($1, $2, 'privacy.request_created', 'data_subject_request', $3, $4::jsonb)
        `, [actor.id, actor.role, id, JSON.stringify({ requestType: input.requestType, version: 1 })]);
        return this.loadRequest(client, id);
      });
    });
  }

  async generateExport(
    actor: Actor,
    requestId: string,
    idempotencyKey: string | undefined,
  ) {
    this.requireSubject(actor);
    this.validateId(requestId);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/privacy/requests/${requestId}/export`,
        payload: { requestId },
      }, async () => {
        const request = await client.query<{
          id: string;
          publicCode: string;
          requestType: RequestType;
          status: RequestStatus;
          version: number;
        }>(`
          SELECT
            id,
            public_code AS "publicCode",
            request_type AS "requestType",
            status,
            version
          FROM data_subject_requests
          WHERE id = $1 AND subject_id = $2
          FOR UPDATE
        `, [requestId, actor.id]);
        const current = request.rows[0];
        if (!current) throw new NotFoundException("Solicitação de privacidade não encontrada.");
        if (current.requestType !== "access") {
          throw new BadRequestException("Somente uma solicitação de acesso gera pacote estruturado.");
        }
        if (current.status !== "open") {
          throw new ConflictException("Este pedido de acesso já foi processado ou está em análise.");
        }

        const generatedAt = new Date().toISOString();
        const manifest = await this.buildExportManifest(client, actor, current.publicCode, generatedAt);
        const checksum = createHash("sha256").update(canonicalJson(manifest)).digest("hex");
        const receiptId = randomUUID();
        const receiptCode = this.publicCode("PX");
        const nextVersion = current.version + 1;
        const resolutionNote = "Pacote estruturado disponibilizado diretamente ao titular no ambiente autenticado.";

        const updated = await client.query(`
          UPDATE data_subject_requests
          SET
            status = 'fulfilled',
            resolution_note = $3,
            version = $4,
            updated_at = $5,
            completed_at = $5
          WHERE id = $1
            AND subject_id = $2
            AND request_type = 'access'
            AND status = 'open'
          RETURNING id
        `, [requestId, actor.id, resolutionNote, nextVersion, generatedAt]);
        if (updated.rowCount !== 1) throw new ConflictException("O pedido de acesso mudou durante a exportação.");

        await client.query(`
          INSERT INTO data_subject_export_receipts (
            id, public_code, request_id, subject_id, manifest_version,
            checksum, section_counts, generated_at
          ) VALUES ($1, $2, $3, $4, 'privacy-export-1', $5, $6::jsonb, $7)
        `, [
          receiptId,
          receiptCode,
          requestId,
          actor.id,
          checksum,
          JSON.stringify(manifest.sectionCounts),
          generatedAt,
        ]);
        await client.query(`
          INSERT INTO data_subject_request_events (
            id, request_id, actor_id, event_type, from_status, to_status,
            request_version, note, snapshot
          ) VALUES ($1, $2, $3, 'export_generated', 'open', 'fulfilled', $4, $5, $6::jsonb)
        `, [
          randomUUID(),
          requestId,
          actor.id,
          nextVersion,
          resolutionNote,
          JSON.stringify({ receiptCode, manifestVersion: "privacy-export-1", checksum }),
        ]);
        await client.query(`
          INSERT INTO audit_events (
            actor_id, actor_role, action, entity_type, entity_id, payload
          ) VALUES ($1, $2, 'privacy.export_generated', 'data_subject_export_receipt', $3, $4::jsonb)
        `, [
          actor.id,
          actor.role,
          receiptId,
          JSON.stringify({ requestId, manifestVersion: "privacy-export-1", checksum }),
        ]);
        return {
          request: await this.loadRequest(client, requestId),
          receipt: {
            id: receiptId,
            publicCode: receiptCode,
            manifestVersion: "privacy-export-1",
            checksum,
            generatedAt,
          },
          export: manifest,
        };
      });
    });
  }

  async operationQueue(actor: Actor) {
    this.requireOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const [requests, events] = await Promise.all([
        client.query<DataSubjectRequestRow>(`
          ${requestSelect}
          ORDER BY
            CASE request.status
              WHEN 'open' THEN 1
              WHEN 'in_review' THEN 2
              WHEN 'awaiting_subject' THEN 3
              ELSE 4
            END,
            request.due_at,
            request.created_at,
            request.id
          LIMIT 100
        `),
        client.query<{
          id: string;
          requestCode: string;
          subjectCode: string;
          eventType: "created" | "status_changed" | "export_generated";
          fromStatus: RequestStatus | null;
          toStatus: RequestStatus;
          requestVersion: number;
          note: string;
          actorName: string;
          createdAt: string;
        }>(`
          SELECT
            event.id,
            request.public_code AS "requestCode",
            subject.public_code AS "subjectCode",
            event.event_type AS "eventType",
            event.from_status AS "fromStatus",
            event.to_status AS "toStatus",
            event.request_version AS "requestVersion",
            event.note,
            actor.display_name AS "actorName",
            event.created_at AS "createdAt"
          FROM data_subject_request_events event
          JOIN data_subject_requests request ON request.id = event.request_id
          JOIN users subject ON subject.id = request.subject_id
          JOIN users actor ON actor.id = event.actor_id
          ORDER BY event.created_at DESC, event.id DESC
          LIMIT 60
        `),
      ]);
      const active = requests.rows.filter((request) =>
        request.status === "open" || request.status === "in_review" || request.status === "awaiting_subject"
      );
      const now = Date.now();
      return {
        policy: {
          version: "privacy-rights-pilot-1",
          operationalTargetDays: 15,
          productionRetentionApproved: false,
          automaticDeletionEnabled: false,
          rule: "Toda decisão é humana, justificada e versionada; exclusão ou anonimização física exige a política de retenção aprovada.",
        },
        metrics: {
          totalCount: requests.rows.length,
          activeCount: active.length,
          openCount: requests.rows.filter((request) => request.status === "open").length,
          inReviewCount: requests.rows.filter((request) => request.status === "in_review").length,
          awaitingSubjectCount: requests.rows.filter((request) => request.status === "awaiting_subject").length,
          fulfilledCount: requests.rows.filter((request) => request.status === "fulfilled").length,
          deniedCount: requests.rows.filter((request) => request.status === "denied").length,
          overdueCount: active.filter((request) => new Date(request.dueAt).getTime() < now).length,
          exportCount: requests.rows.filter((request) => request.exportCode !== null).length,
        },
        requests: requests.rows,
        history: events.rows,
      };
    });
  }

  async transitionRequest(
    actor: Actor,
    requestId: string,
    input: TransitionDataSubjectRequestDto,
    idempotencyKey: string | undefined,
  ) {
    this.requireOperation(actor);
    this.validateId(requestId);
    const note = input.note.trim();
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/privacy/${requestId}/transitions`,
        payload: { status: input.status, expectedVersion: input.expectedVersion, note },
      }, async () => {
        const selected = await client.query<{
          status: RequestStatus;
          requestType: RequestType;
          version: number;
        }>(`
          SELECT
            status,
            request_type AS "requestType",
            version
          FROM data_subject_requests
          WHERE id = $1
          FOR UPDATE
        `, [requestId]);
        const current = selected.rows[0];
        if (!current) throw new NotFoundException("Solicitação de privacidade não encontrada.");
        if (current.version !== input.expectedVersion) {
          throw new ConflictException("A solicitação mudou. Atualize a fila antes de decidir.");
        }
        if (!this.allowedTransitions(current.status).includes(input.status)) {
          throw new ConflictException(`Transição ${current.status} → ${input.status} não permitida.`);
        }
        if (current.requestType === "access" && input.status === "fulfilled") {
          throw new BadRequestException("O pedido de acesso é atendido pelo pacote gerado diretamente ao titular.");
        }
        if (
          input.status === "fulfilled"
          && (current.requestType === "deletion" || current.requestType === "restriction")
          && !note.toLocaleLowerCase("pt-BR").includes("reten")
          && !note.toLocaleLowerCase("pt-BR").includes("anonim")
        ) {
          throw new BadRequestException("A conclusão deve registrar o tratamento de retenção ou anonimização.");
        }

        const nextVersion = current.version + 1;
        const final = input.status === "fulfilled" || input.status === "denied";
        const updated = await client.query(`
          UPDATE data_subject_requests
          SET
            status = $2,
            assigned_to = $3,
            resolution_note = CASE WHEN $4::boolean THEN $5 ELSE NULL END,
            version = $6,
            updated_at = now(),
            completed_at = CASE WHEN $4::boolean THEN now() ELSE NULL END
          WHERE id = $1 AND version = $7
          RETURNING id
        `, [requestId, input.status, actor.id, final, note, nextVersion, current.version]);
        if (updated.rowCount !== 1) throw new ConflictException("A solicitação mudou durante a decisão.");

        const eventId = randomUUID();
        await client.query(`
          INSERT INTO data_subject_request_events (
            id, request_id, actor_id, event_type, from_status, to_status,
            request_version, note, snapshot
          ) VALUES ($1, $2, $3, 'status_changed', $4, $5, $6, $7, $8::jsonb)
        `, [
          eventId,
          requestId,
          actor.id,
          current.status,
          input.status,
          nextVersion,
          note,
          JSON.stringify({
            requestType: current.requestType,
            automaticDeletionPerformed: false,
            productionRetentionApproved: false,
          }),
        ]);
        await client.query(`
          INSERT INTO audit_events (
            actor_id, actor_role, action, entity_type, entity_id, payload
          ) VALUES ($1, $2, 'privacy.request_status_changed', 'data_subject_request', $3, $4::jsonb)
        `, [
          actor.id,
          actor.role,
          requestId,
          JSON.stringify({
            fromStatus: current.status,
            toStatus: input.status,
            version: nextVersion,
            eventId,
          }),
        ]);
        return this.loadRequest(client, requestId);
      });
    });
  }

  private async buildExportManifest(
    client: PoolClient,
    actor: Actor & { role: SubjectRole },
    requestCode: string,
    generatedAt: string,
  ) {
    const identity = await client.query<IdentityRow>(`
      SELECT
        public_code AS "publicCode",
        role,
        display_name AS "displayName",
        email,
        created_at AS "createdAt"
      FROM current_data_subject_identity()
    `);
    if (!identity.rows[0]) throw new NotFoundException("Identidade do titular não encontrada.");

    const profile = await client.query<{
      profileType: string;
      city: string;
      state: string;
      neighborhood: string | null;
      serviceCategory: string | null;
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
        profile.city,
        profile.state,
        profile.neighborhood,
        category.name AS "serviceCategory",
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
      purpose: string;
      granted: boolean;
      noticeVersion: string;
      source: string;
      updatedAt: string;
    }>(`
      SELECT
        preference.purpose,
        preference.granted,
        document.version AS "noticeVersion",
        preference.source,
        preference.updated_at AS "updatedAt"
      FROM consent_preferences preference
      JOIN legal_documents document ON document.id = preference.privacy_document_id
      WHERE preference.user_id = $1
      ORDER BY preference.purpose
    `, [actor.id]);
    const acceptances = await client.query<{
      documentType: string;
      version: string;
      title: string;
      contentSha256: string;
      source: string;
      acceptedAt: string;
    }>(`
      SELECT
        document.document_type AS "documentType",
        document.version,
        document.title,
        acceptance.document_sha256 AS "contentSha256",
        acceptance.source,
        acceptance.accepted_at AS "acceptedAt"
      FROM legal_acceptances acceptance
      JOIN legal_documents document ON document.id = acceptance.document_id
      WHERE acceptance.user_id = $1
      ORDER BY acceptance.accepted_at, acceptance.id
    `, [actor.id]);
    const notificationPreferences = await client.query<{
      pushMarketplace: boolean;
      pushMessages: boolean;
      pushSupport: boolean;
      pushSystem: boolean;
      quietHoursEnabled: boolean;
      quietStart: string;
      quietEnd: string;
      timeZone: string;
      version: number;
      updatedAt: string;
    }>(`
      SELECT
        push_marketplace AS "pushMarketplace",
        push_messages AS "pushMessages",
        push_support AS "pushSupport",
        push_system AS "pushSystem",
        quiet_hours_enabled AS "quietHoursEnabled",
        quiet_start::text AS "quietStart",
        quiet_end::text AS "quietEnd",
        time_zone AS "timeZone",
        version,
        updated_at AS "updatedAt"
      FROM notification_preferences
      WHERE user_id = $1
    `, [actor.id]);
    const customerRequests = await client.query<{
      publicCode: string;
      category: string;
      title: string;
      description: string;
      neighborhood: string;
      city: string;
      state: string;
      preferredWindow: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>(`
      SELECT
        request.public_code AS "publicCode",
        category.name AS category,
        request.title,
        request.description,
        request.neighborhood,
        request.city,
        request.state,
        request.preferred_window AS "preferredWindow",
        request.status,
        request.created_at AS "createdAt",
        request.updated_at AS "updatedAt"
      FROM service_requests request
      JOIN service_categories category ON category.id = request.category_id
      WHERE request.customer_id = $1
      ORDER BY request.created_at, request.id
    `, [actor.id]);
    const providerProposals = await client.query<{
      requestCode: string;
      amountCents: number;
      estimatedMinutes: number;
      message: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>(`
      SELECT
        request.public_code AS "requestCode",
        proposal.amount_cents AS "amountCents",
        proposal.estimated_minutes AS "estimatedMinutes",
        proposal.message,
        proposal.status,
        proposal.created_at AS "createdAt",
        proposal.updated_at AS "updatedAt"
      FROM proposals proposal
      JOIN service_requests request ON request.id = proposal.request_id
      WHERE proposal.provider_id = $1
      ORDER BY proposal.created_at, proposal.id
    `, [actor.id]);
    const bookings = await client.query<{
      requestCode: string;
      participantRole: string;
      status: string;
      scheduledFor: string | null;
      startedAt: string | null;
      completedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>(`
      SELECT
        request.public_code AS "requestCode",
        CASE WHEN booking.customer_id = $1 THEN 'customer' ELSE 'provider' END AS "participantRole",
        booking.status,
        booking.scheduled_for AS "scheduledFor",
        booking.started_at AS "startedAt",
        booking.completed_at AS "completedAt",
        booking.created_at AS "createdAt",
        booking.updated_at AS "updatedAt"
      FROM bookings booking
      JOIN service_requests request ON request.id = booking.request_id
      WHERE booking.customer_id = $1 OR booking.provider_id = $1
      ORDER BY booking.created_at, booking.id
    `, [actor.id]);
    const sentMessages = await client.query<{ count: number; firstAt: string | null; lastAt: string | null }>(`
      SELECT
        count(*)::int AS count,
        min(created_at) AS "firstAt",
        max(created_at) AS "lastAt"
      FROM messages
      WHERE sender_id = $1
    `, [actor.id]);
    const notifications = await client.query<{ type: string; readAt: string | null; createdAt: string }>(`
      SELECT type, read_at AS "readAt", created_at AS "createdAt"
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at, id
    `, [actor.id]);
    const referrals = await client.query<{ publicCode: string; status: string; source: string; createdAt: string }>(`
      SELECT
        public_code AS "publicCode",
        status,
        source,
        created_at AS "createdAt"
      FROM partner_referrals
      WHERE partner_id = $1
      ORDER BY created_at, id
    `, [actor.id]);
    const supportCases = await client.query<{
      publicCode: string;
      topic: string;
      priority: string;
      status: string;
      subject: string;
      createdAt: string;
      updatedAt: string;
    }>(`
      SELECT
        public_code AS "publicCode",
        topic,
        priority,
        status,
        subject,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM partner_support_cases
      WHERE partner_id = $1
      ORDER BY created_at, id
    `, [actor.id]);
    const advertising = await client.query<{
      publicCode: string;
      name: string;
      headline: string;
      status: string;
      startsAt: string;
      endsAt: string;
      createdAt: string;
      updatedAt: string;
    }>(`
      SELECT
        public_code AS "publicCode",
        name,
        headline,
        status,
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM contextual_ad_campaigns
      WHERE advertiser_id = $1
      ORDER BY created_at, id
    `, [actor.id]);

    const sectionCounts = {
      profile: profile.rowCount,
      consents: consents.rowCount,
      legalAcceptances: acceptances.rowCount,
      notificationPreferences: notificationPreferences.rowCount,
      customerRequests: customerRequests.rowCount,
      providerProposals: providerProposals.rowCount,
      bookings: bookings.rowCount,
      sentMessages: sentMessages.rows[0]?.count ?? 0,
      notifications: notifications.rowCount,
      partnerReferrals: referrals.rowCount,
      partnerSupportCases: supportCases.rowCount,
      advertisingCampaigns: advertising.rowCount,
    };
    return {
      schemaVersion: "privacy-export-1",
      generatedAt,
      requestCode,
      scope: {
        subjectOnly: true,
        thirdPartyContentExcluded: true,
        syntheticPilotDataOnly: true,
      },
      identity: identity.rows[0],
      profile: profile.rows[0] ?? null,
      consents: consents.rows,
      legalAcceptances: acceptances.rows,
      notificationPreferences: notificationPreferences.rows[0] ?? null,
      activity: {
        customerRequests: customerRequests.rows,
        providerProposals: providerProposals.rows,
        bookings: bookings.rows,
        sentMessages: sentMessages.rows[0] ?? { count: 0, firstAt: null, lastAt: null },
        notifications: notifications.rows,
        partnerReferrals: referrals.rows,
        partnerSupportCases: supportCases.rows,
        advertisingCampaigns: advertising.rows,
      },
      sectionCounts,
    };
  }

  private async loadRequest(client: PoolClient, requestId: string) {
    const result = await client.query<DataSubjectRequestRow>(`
      ${requestSelect}
      WHERE request.id = $1
    `, [requestId]);
    if (!result.rows[0]) throw new NotFoundException("Solicitação de privacidade não encontrada.");
    return result.rows[0];
  }

  private subjectMetrics(requests: DataSubjectRequestRow[]) {
    const active = requests.filter((request) =>
      request.status === "open" || request.status === "in_review" || request.status === "awaiting_subject"
    );
    return {
      totalCount: requests.length,
      activeCount: active.length,
      fulfilledCount: requests.filter((request) => request.status === "fulfilled").length,
      exportCount: requests.filter((request) => request.exportCode !== null).length,
    };
  }

  private allowedTransitions(status: RequestStatus): RequestStatus[] {
    if (status === "open") return ["in_review"];
    if (status === "in_review") return ["awaiting_subject", "fulfilled", "denied"];
    if (status === "awaiting_subject") return ["in_review", "fulfilled", "denied"];
    return [];
  }

  private requireSubject(actor: Actor): asserts actor is Actor & { role: SubjectRole } {
    if (actor.role === "operation") {
      throw new ForbiddenException("A conta operacional usa a fila de privacidade, não a central do titular.");
    }
  }

  private requireOperation(actor: Actor) {
    if (actor.role !== "operation") {
      throw new ForbiddenException("A fila de privacidade é exclusiva da Operação.");
    }
  }

  private validateId(id: string) {
    if (!uuidPattern.test(id)) throw new BadRequestException("Identificador de privacidade inválido.");
  }

  private publicCode(prefix: "DS" | "PX") {
    return `${prefix}-${randomBytes(5).toString("hex").toUpperCase()}`;
  }
}
