import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export interface NotificationInput {
  userId: string;
  actorId: string;
  type: "proposal_received" | "proposal_accepted" | "message_received" | "booking_started" | "booking_completed" | "booking_cancelled" | "review_received" | "case_opened" | "case_updated" | "referral_reviewed" | "support_message";
  title: string;
  body: string;
  entityType: "proposal" | "booking" | "conversation" | "service_review" | "support_case" | "partner_referral" | "partner_support_case";
  entityId: string;
}

export async function createNotification(client: PoolClient, input: NotificationInput) {
  const id = randomUUID();
  await client.query(`
    INSERT INTO notifications (id, user_id, actor_id, type, title, body, entity_type, entity_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [id, input.userId, input.actorId, input.type, input.title, input.body, input.entityType, input.entityId]);
  return id;
}
