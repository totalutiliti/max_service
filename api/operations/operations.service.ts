import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class OperationsService {
  constructor(private readonly database: DatabaseService) {}

  async cases(actor: Actor) {
    if (actor.role !== "operation") throw new ForbiddenException("Somente a operação pode consultar esta fila.");
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`
        SELECT
          sc.id,
          sc.public_code AS "publicCode",
          sc.case_type AS "caseType",
          sc.priority,
          sc.status,
          sc.title,
          sc.description,
          sc.created_at AS "createdAt",
          r.public_code AS "requestCode",
          r.title AS "requestTitle",
          bc.reason_code AS "reasonCode",
          bc.prior_status AS "priorStatus",
          opener.display_name AS "openedByName",
          opener.role AS "openedByRole"
        FROM support_cases sc
        JOIN bookings b ON b.id = sc.booking_id
        JOIN service_requests r ON r.id = b.request_id
        JOIN booking_cancellations bc ON bc.booking_id = b.id
        JOIN users opener ON opener.id = sc.opened_by
        ORDER BY
          CASE sc.priority WHEN 'high' THEN 0 ELSE 1 END,
          sc.created_at DESC
      `);
      return result.rows;
    });
  }
}
