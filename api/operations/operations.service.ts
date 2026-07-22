import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { createNotification } from "../notifications/notification-writer.js";

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

@Injectable()
export class OperationsService {
  constructor(private readonly database: DatabaseService) {}

  private ensureOperation(actor: Actor) {
    if (actor.role !== "operation") throw new ForbiddenException("Somente a operação pode tratar esta fila.");
  }

  private normalizeNote(note: string) {
    const normalized = note.trim();
    if (normalized.length < 10) throw new BadRequestException("Registre uma justificativa com pelo menos 10 caracteres.");
    return normalized;
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

  async changeStatus(actor: Actor, caseId: string, status: "in_review" | "resolved", note: string) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
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
  }

  async addNote(actor: Actor, caseId: string, note: string) {
    this.ensureOperation(actor);
    const normalizedNote = this.normalizeNote(note);
    return this.database.withActor(actor, async (client) => {
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
  }
}
