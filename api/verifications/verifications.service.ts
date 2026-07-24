import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { idempotencyDerivedUuid } from "../idempotency/idempotency.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import { PrivateObjectStorageService } from "../storage/private-object-storage.service.js";
import { validateProviderDocumentFile } from "./document-file-validation.js";

type VerificationStatus = "submitted" | "in_review" | "changes_requested" | "approved";
type DocumentStatus = "accepted" | "changes_requested";

const verificationSelect = `
  SELECT
    verification.id,
    verification.public_code AS "publicCode",
    verification.provider_id AS "providerId",
    verification.status,
    verification.review_priority AS "reviewPriority",
    verification.policy_version AS "policyVersion",
    verification.submitted_at AS "submittedAt",
    verification.decision_reason AS "decisionReason",
    verification.decided_at AS "decidedAt",
    verification.updated_at AS "updatedAt",
    provider.display_name AS "providerName",
    provider.public_code AS "providerCode",
    CASE WHEN verification.assigned_to IS NULL THEN NULL ELSE COALESCE(assignee.display_name, 'Equipe Max') END AS "assignedToName",
    (SELECT count(*)::int FROM provider_document_checks document WHERE document.verification_id = verification.id) AS "documentCount",
    (SELECT count(*)::int FROM provider_document_checks document WHERE document.verification_id = verification.id AND document.status = 'accepted') AS "acceptedDocumentCount",
    (SELECT count(*)::int FROM provider_document_checks document WHERE document.verification_id = verification.id AND document.status <> 'accepted') AS "attentionDocumentCount"
  FROM provider_verifications verification
  JOIN users provider ON provider.id = verification.provider_id
  LEFT JOIN users assignee ON assignee.id = verification.assigned_to
`;

@Injectable()
export class VerificationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly idempotency: IdempotencyService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  private ensureOperation(actor: Actor) {
    if (actor.role !== "operation") throw new ForbiddenException("Somente a operação pode revisar cadastros.");
  }

  private ensureProvider(actor: Actor) {
    if (actor.role !== "provider") throw new ForbiddenException("Somente o profissional pode consultar a própria verificação.");
  }

  private normalizeNote(note: string) {
    const normalized = note.trim();
    if (normalized.length < 10) throw new BadRequestException("Registre uma justificativa com pelo menos 10 caracteres.");
    return normalized;
  }

  private async detailWithClient(client: PoolClient, verificationId: string) {
    const record = await client.query(`${verificationSelect} WHERE verification.id = $1`, [verificationId]);
    if (!record.rows[0]) throw new NotFoundException("Verificação não encontrada.");
    const documents = await client.query(`
      SELECT
        document.id,
        document.document_type AS "documentType",
        document.label,
        document.status,
        document.note,
        document.checked_at AS "checkedAt",
        document.updated_at AS "updatedAt",
        CASE WHEN document.checked_by IS NULL THEN NULL ELSE COALESCE(reviewer.display_name, 'Equipe Max') END AS "checkedByName",
        latest_file.id AS "fileId",
        latest_file.original_name AS "fileName",
        latest_file.content_type AS "fileContentType",
        latest_file.size_bytes AS "fileSizeBytes",
        latest_file.sha256 AS "fileSha256",
        latest_file.scan_status AS "fileScanStatus",
        latest_file.uploaded_at AS "fileUploadedAt",
        (SELECT count(*)::int FROM provider_document_files file_count WHERE file_count.document_check_id = document.id) AS "fileVersionCount"
      FROM provider_document_checks document
      LEFT JOIN users reviewer ON reviewer.id = document.checked_by
      LEFT JOIN LATERAL (
        SELECT file.id, file.original_name, file.content_type, file.size_bytes, file.sha256, file.scan_status, file.uploaded_at
        FROM provider_document_files file
        WHERE file.document_check_id = document.id
        ORDER BY file.uploaded_at DESC, file.id DESC
        LIMIT 1
      ) latest_file ON true
      WHERE document.verification_id = $1
      ORDER BY CASE document.document_type
        WHEN 'identity' THEN 1 WHEN 'address' THEN 2
        WHEN 'professional_qualification' THEN 3 ELSE 4 END
    `, [verificationId]);
    const events = await client.query(`
      SELECT
        event.id,
        event.event_type AS "eventType",
        event.from_status AS "fromStatus",
        event.to_status AS "toStatus",
        event.note,
        event.created_at AS "createdAt",
        COALESCE(actor.display_name, 'Equipe Max') AS "actorName",
        COALESCE(actor.role, 'operation') AS "actorRole"
      FROM provider_verification_events event
      LEFT JOIN users actor ON actor.id = event.actor_id
      WHERE event.verification_id = $1
      ORDER BY event.created_at DESC, event.id DESC
    `, [verificationId]);
    return { ...record.rows[0], documents: documents.rows, events: events.rows };
  }

  async providerStatus(actor: Actor) {
    this.ensureProvider(actor);
    return this.database.withActor(actor, async (client) => {
      const verification = await client.query<{ id: string }>(
        "SELECT id FROM provider_verifications WHERE provider_id = $1",
        [actor.id],
      );
      if (!verification.rows[0]) throw new NotFoundException("Verificação do profissional não encontrada.");
      return this.detailWithClient(client, verification.rows[0].id);
    });
  }

  async queue(actor: Actor) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`${verificationSelect}
        ORDER BY
          CASE verification.status WHEN 'in_review' THEN 0 WHEN 'submitted' THEN 1 WHEN 'changes_requested' THEN 2 ELSE 3 END,
          CASE verification.review_priority WHEN 'attention' THEN 0 ELSE 1 END,
          verification.updated_at DESC
      `);
      return result.rows;
    });
  }

  async detail(actor: Actor, verificationId: string) {
    this.ensureOperation(actor);
    return this.database.withActor(actor, (client) => this.detailWithClient(client, verificationId));
  }

  async changeStatus(
    actor: Actor,
    verificationId: string,
    status: Exclude<VerificationStatus, "submitted">,
    note: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/verifications/${verificationId}/transitions`,
        payload: { status, note: normalizedNote },
      }, async () => {
      const current = await client.query<{ id: string; status: VerificationStatus }>(
        "SELECT id, status FROM provider_verifications WHERE id = $1 FOR UPDATE",
        [verificationId],
      );
      if (!current.rows[0]) throw new NotFoundException("Verificação não encontrada.");
      const fromStatus = current.rows[0].status;
      const allowed: Record<VerificationStatus, VerificationStatus[]> = {
        submitted: ["in_review"],
        in_review: ["approved", "changes_requested"],
        changes_requested: [],
        approved: [],
      };
      if (!allowed[fromStatus].includes(status)) {
        throw new ConflictException("Esta transição não é permitida para o estado atual.");
      }

      if (status === "approved") {
        const pending = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM provider_document_checks WHERE verification_id = $1 AND status <> 'accepted'",
          [verificationId],
        );
        if (pending.rows[0].count > 0) throw new ConflictException("Revise e aceite todos os itens antes da aprovação.");
      }
      if (status === "changes_requested") {
        const corrections = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM provider_document_checks WHERE verification_id = $1 AND status = 'changes_requested'",
          [verificationId],
        );
        if (corrections.rows[0].count === 0) throw new ConflictException("Marque ao menos um item para correção antes de solicitar o reenvio.");
      }

      await client.query(`
        UPDATE provider_verifications
        SET
          status = $2,
          assigned_to = $3,
          decision_reason = CASE WHEN $2 IN ('approved', 'changes_requested') THEN $4 ELSE NULL END,
          decided_at = CASE WHEN $2 IN ('approved', 'changes_requested') THEN now() ELSE NULL END,
          updated_at = now()
        WHERE id = $1
      `, [verificationId, status, actor.id, normalizedNote]);

      const eventId = randomUUID();
      const eventType = status === "in_review" ? "review_started" : status;
      await client.query(`
        INSERT INTO provider_verification_events (id, verification_id, actor_id, event_type, from_status, to_status, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [eventId, verificationId, actor.id, eventType, fromStatus, status, normalizedNote]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'provider_verification.status_changed', 'provider_verification', $3, $4::jsonb)",
        [actor.id, actor.role, verificationId, JSON.stringify({ from: fromStatus, to: status, eventId })],
      );
      return this.detailWithClient(client, verificationId);
      });
    });
  }

  async reviewDocument(
    actor: Actor,
    verificationId: string,
    documentId: string,
    status: DocumentStatus,
    note: string,
    idempotencyKey: string | undefined,
  ) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
      return this.idempotency.execute(client, actor, {
        key: idempotencyKey,
        method: "POST",
        route: `/api/v1/operation/verifications/${verificationId}/documents/${documentId}/reviews`,
        payload: { status, note: normalizedNote },
      }, async () => {
      const record = await client.query<{ id: string; verificationStatus: VerificationStatus; documentStatus: string; label: string }>(`
        SELECT
          document.id,
          verification.status AS "verificationStatus",
          document.status AS "documentStatus",
          document.label
        FROM provider_document_checks document
        JOIN provider_verifications verification ON verification.id = document.verification_id
        WHERE verification.id = $1 AND document.id = $2
        FOR UPDATE OF document, verification
      `, [verificationId, documentId]);
      if (!record.rows[0]) throw new NotFoundException("Item documental não encontrado.");
      if (record.rows[0].verificationStatus !== "in_review") {
        throw new ConflictException("Inicie a análise antes de revisar os itens documentais.");
      }
      if (record.rows[0].documentStatus === status) throw new ConflictException("O item já está neste estado.");

      await client.query(`
        UPDATE provider_document_checks
        SET status = $3, note = $4, checked_by = $5, checked_at = now(), updated_at = now()
        WHERE verification_id = $1 AND id = $2
      `, [verificationId, documentId, status, normalizedNote, actor.id]);
      await client.query("UPDATE provider_verifications SET assigned_to = $2, updated_at = now() WHERE id = $1", [verificationId, actor.id]);

      const eventId = randomUUID();
      const eventNote = `${record.rows[0].label}: ${normalizedNote}`.slice(0, 1000);
      await client.query(`
        INSERT INTO provider_verification_events (id, verification_id, actor_id, event_type, note)
        VALUES ($1, $2, $3, 'document_reviewed', $4)
      `, [eventId, verificationId, actor.id, eventNote]);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'provider_verification.document_reviewed', 'provider_document_check', $3, $4::jsonb)",
        [actor.id, actor.role, documentId, JSON.stringify({ verificationId, from: record.rows[0].documentStatus, to: status, eventId })],
      );
      return this.detailWithClient(client, verificationId);
      });
    });
  }

  async uploadDocument(
    actor: Actor,
    documentId: string,
    originalName: string,
    contentType: string,
    bytes: Buffer,
    idempotencyKey: string | undefined,
  ) {
    this.ensureProvider(actor);
    const fileName = validateProviderDocumentFile(originalName, contentType, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const route = `/api/v1/provider/verification/documents/${documentId}/files`;
    let objectKey: string | null = null;
    try {
      return await this.database.withActor(actor, async (client) => {
        return this.idempotency.execute(client, actor, {
          key: idempotencyKey,
          method: "POST",
          route,
          payload: { fileName, contentType, sizeBytes: bytes.length, sha256 },
        }, async () => {
        const document = await client.query<{ verificationId: string; providerId: string; label: string }>(`
          SELECT verification.id AS "verificationId", verification.provider_id AS "providerId", document.label
          FROM provider_document_checks document
          JOIN provider_verifications verification ON verification.id = document.verification_id
          WHERE document.id = $1 AND verification.provider_id = $2
        `, [documentId, actor.id]);
        if (!document.rows[0]) throw new NotFoundException("Item documental não encontrado.");

        const fileId = idempotencyDerivedUuid([
          actor.role,
          actor.id,
          route,
          idempotencyKey ?? "",
          "file",
        ]);
        objectKey = `provider-verifications/${document.rows[0].verificationId}/${documentId}/${fileId}`;
        await this.storage.put(objectKey, bytes, contentType, sha256);
        await client.query(`
          INSERT INTO provider_document_files (
            id, verification_id, document_check_id, provider_id, object_key,
            original_name, content_type, size_bytes, sha256, uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $4)
        `, [fileId, document.rows[0].verificationId, documentId, actor.id, objectKey, fileName, contentType, bytes.length, sha256]);
        const eventId = randomUUID();
        await client.query(`
          INSERT INTO provider_verification_events (id, verification_id, actor_id, event_type, note)
          VALUES ($1, $2, $3, 'document_uploaded', $4)
        `, [eventId, document.rows[0].verificationId, actor.id, `${document.rows[0].label}: novo arquivo sintético privado enviado para conferência.`]);
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'provider_document.uploaded', 'provider_document_file', $3, $4::jsonb)",
          [actor.id, actor.role, fileId, JSON.stringify({
            documentId,
            verificationId: document.rows[0].verificationId,
            contentType,
            sizeBytes: bytes.length,
            sha256,
            eventId,
          })],
        );
        return this.detailWithClient(client, document.rows[0].verificationId);
        });
      });
    } catch (error) {
      if (objectKey) await this.storage.remove(objectKey);
      throw error;
    }
  }

  async downloadDocument(actor: Actor, fileId: string) {
    if (actor.role !== "provider" && actor.role !== "operation") {
      throw new ForbiddenException("Perfil sem acesso ao cofre documental.");
    }
    const record = await this.database.withActor(actor, async (client) => {
      const result = await client.query<{
        id: string;
        objectKey: string;
        originalName: string;
        contentType: string;
        sizeBytes: number;
        sha256: string;
      }>(`
        SELECT
          file.id,
          file.object_key AS "objectKey",
          file.original_name AS "originalName",
          file.content_type AS "contentType",
          file.size_bytes AS "sizeBytes",
          file.sha256
        FROM provider_document_files file
        WHERE file.id = $1
      `, [fileId]);
      return result.rows[0];
    });
    if (!record) throw new NotFoundException("Arquivo privado não encontrado.");
    const bytes = await this.storage.get(record.objectKey);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== record.sizeBytes || actualHash !== record.sha256) {
      throw new ConflictException("A integridade do arquivo privado não pôde ser confirmada.");
    }
    await this.database.withActor(actor, async (client) => {
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'provider_document.downloaded', 'provider_document_file', $3, $4::jsonb)",
        [actor.id, actor.role, fileId, JSON.stringify({ contentType: record.contentType, sizeBytes: record.sizeBytes, sha256: record.sha256 })],
      );
    });
    return { ...record, bytes };
  }
}
