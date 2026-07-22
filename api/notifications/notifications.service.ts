import { Injectable, NotFoundException } from "@nestjs/common";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(actor: Actor) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`
        SELECT
          notification.id,
          notification.type,
          notification.title,
          notification.body,
          notification.entity_type AS "entityType",
          notification.entity_id AS "entityId",
          notification.read_at AS "readAt",
          notification.created_at AS "createdAt",
          source.display_name AS "actorName"
        FROM notifications notification
        LEFT JOIN users source ON source.id = notification.actor_id
        ORDER BY notification.created_at DESC, notification.id DESC
        LIMIT 50
      `);
      const unread = await client.query<{ unreadCount: number }>(
        "SELECT count(*)::int AS \"unreadCount\" FROM notifications WHERE read_at IS NULL",
      );
      return { notifications: result.rows, unreadCount: unread.rows[0].unreadCount };
    });
  }

  async markRead(actor: Actor, notificationId: string) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`
        UPDATE notifications
        SET read_at = COALESCE(read_at, now())
        WHERE id = $1 AND user_id = $2
        RETURNING id, read_at AS "readAt"
      `, [notificationId, actor.id]);
      if (!result.rows[0]) throw new NotFoundException("Notificação não encontrada.");
      return result.rows[0];
    });
  }

  async markAllRead(actor: Actor) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`
        UPDATE notifications
        SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL
        RETURNING id
      `, [actor.id]);
      return { updated: result.rowCount ?? 0 };
    });
  }
}
