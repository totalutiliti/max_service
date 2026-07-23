import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import { pushConfiguration } from "./push-config.js";
import { validatePushEndpoint, validatePushSubscription } from "./push-subscription-validation.js";

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

  async pushStatus(actor: Actor) {
    const configuration = pushConfiguration();
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<{ subscriptionCount: number }>(`
        SELECT count(*)::int AS "subscriptionCount"
        FROM push_subscriptions
        WHERE revoked_at IS NULL
      `);
      const subscriptionCount = result.rows[0].subscriptionCount;
      return {
        available: Boolean(configuration),
        publicKey: configuration?.publicKey ?? null,
        enabled: subscriptionCount > 0,
        subscriptionCount,
      };
    });
  }

  async subscribePush(actor: Actor, rawSubscription: unknown) {
    if (!pushConfiguration()) {
      throw new ServiceUnavailableException("O canal Web Push ainda não está configurado.");
    }
    let subscription: ReturnType<typeof validatePushSubscription>;
    try {
      subscription = validatePushSubscription(rawSubscription);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Assinatura push inválida.");
    }
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<{ id: string; createdAt: string; updatedAt: string }>(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, expiration_time)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, endpoint) DO UPDATE
        SET p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            expiration_time = EXCLUDED.expiration_time,
            updated_at = now(),
            revoked_at = NULL
        RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt"
      `, [
        actor.id,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        subscription.expirationTime,
      ]);
      return { subscription: result.rows[0] };
    });
  }

  async pushEndpointStatus(actor: Actor, rawEndpoint: unknown) {
    let endpoint: string;
    try {
      endpoint = validatePushEndpoint(rawEndpoint);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Endpoint push inválido.");
    }
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<{ enabled: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM push_subscriptions
          WHERE user_id = $1
            AND endpoint = $2
            AND revoked_at IS NULL
        ) AS enabled
      `, [actor.id, endpoint]);
      return { enabled: result.rows[0].enabled };
    });
  }

  async unsubscribePush(actor: Actor, rawEndpoint: unknown) {
    let endpoint: string;
    try {
      endpoint = validatePushEndpoint(rawEndpoint);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Endpoint push inválido.");
    }
    return this.database.withActor(actor, async (client) => {
      const result = await client.query(`
        UPDATE push_subscriptions
        SET revoked_at = COALESCE(revoked_at, now()),
            updated_at = now()
        WHERE user_id = $1
          AND endpoint = $2
          AND revoked_at IS NULL
        RETURNING id
      `, [actor.id, endpoint]);
      return { disabled: true, updated: result.rowCount ?? 0 };
    });
  }
}
