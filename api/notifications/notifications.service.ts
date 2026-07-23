import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import {
  notificationCategoryForType,
  notificationTimeZones,
  type NotificationPreferencesInput,
  validateNotificationPreferences,
} from "./notification-preferences.js";
import { pushConfiguration } from "./push-config.js";
import { validatePushEndpoint, validatePushSubscription } from "./push-subscription-validation.js";

interface NotificationPreferenceRow extends NotificationPreferencesInput {
  version: number;
  updatedAt: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(actor: Actor) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<{
        id: string;
        type: string;
        title: string;
        body: string;
        entityType: string;
        entityId: string;
        readAt: string | null;
        createdAt: string;
        actorName: string | null;
      }>(`
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
      return {
        notifications: result.rows.map((notification) => ({
          ...notification,
          category: notificationCategoryForType(notification.type),
        })),
        unreadCount: unread.rows[0].unreadCount,
      };
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

  async preferences(actor: Actor) {
    return this.database.withActor(actor, async (client) => this.loadPreferences(client, actor));
  }

  async updatePreferences(actor: Actor, rawPreferences: unknown) {
    let input: NotificationPreferencesInput;
    try {
      input = validateNotificationPreferences(rawPreferences);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Preferências inválidas.");
    }

    return this.database.withActor(actor, async (client) => {
      await this.ensurePreferences(client, actor.id);
      const currentResult = await client.query<NotificationPreferenceRow>(`
        SELECT
          push_marketplace AS "marketplacePush",
          push_messages AS "messagesPush",
          push_support AS "supportPush",
          push_system AS "systemPush",
          quiet_hours_enabled AS "quietHoursEnabled",
          to_char(quiet_start, 'HH24:MI') AS "quietStart",
          to_char(quiet_end, 'HH24:MI') AS "quietEnd",
          time_zone AS "timeZone",
          version,
          updated_at AS "updatedAt"
        FROM notification_preferences
        WHERE user_id = $1
        FOR UPDATE
      `, [actor.id]);
      const current = currentResult.rows[0];
      if (this.preferencesMatch(current, input)) {
        return { ...(await this.loadPreferences(client, actor)), changed: false, suppressedDeliveries: 0 };
      }

      const updatedResult = await client.query<NotificationPreferenceRow>(`
        UPDATE notification_preferences
        SET push_marketplace = $2,
            push_messages = $3,
            push_support = $4,
            push_system = $5,
            quiet_hours_enabled = $6,
            quiet_start = $7::time,
            quiet_end = $8::time,
            time_zone = $9,
            version = version + 1,
            updated_at = now()
        WHERE user_id = $1
        RETURNING
          push_marketplace AS "marketplacePush",
          push_messages AS "messagesPush",
          push_support AS "supportPush",
          push_system AS "systemPush",
          quiet_hours_enabled AS "quietHoursEnabled",
          to_char(quiet_start, 'HH24:MI') AS "quietStart",
          to_char(quiet_end, 'HH24:MI') AS "quietEnd",
          time_zone AS "timeZone",
          version,
          updated_at AS "updatedAt"
      `, [
        actor.id,
        input.marketplacePush,
        input.messagesPush,
        input.supportPush,
        input.systemPush,
        input.quietHoursEnabled,
        input.quietStart,
        input.quietEnd,
        input.timeZone,
      ]);
      const updated = updatedResult.rows[0];
      const eventId = randomUUID();
      await client.query(`
        INSERT INTO notification_preference_events (
          id,
          user_id,
          actor_id,
          version,
          previous_preferences,
          preferences
        ) VALUES ($1, $2, $2, $3, $4::jsonb, $5::jsonb)
      `, [
        eventId,
        actor.id,
        updated.version,
        JSON.stringify(this.preferenceSnapshot(current)),
        JSON.stringify(this.preferenceSnapshot(updated)),
      ]);
      const reconciled = await client.query<{ suppressedDeliveries: number }>(
        "SELECT reconcile_notification_push_deliveries($1) AS \"suppressedDeliveries\"",
        [actor.id],
      );
      const suppressedDeliveries = reconciled.rows[0].suppressedDeliveries;
      const enabledCategories = [
        updated.marketplacePush ? "marketplace" : null,
        updated.messagesPush ? "messages" : null,
        updated.supportPush ? "support" : null,
        updated.systemPush ? "system" : null,
      ].filter(Boolean);
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'notification.preferences_updated', 'notification_preferences', $1, $3::jsonb)",
        [actor.id, actor.role, JSON.stringify({
          version: updated.version,
          enabledCategories,
          quietHoursEnabled: updated.quietHoursEnabled,
          timeZone: updated.timeZone,
          suppressedDeliveries,
        })],
      );
      return {
        ...(await this.loadPreferences(client, actor)),
        changed: true,
        suppressedDeliveries,
      };
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
      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'notification.push_subscribed', 'push_subscription', $3, $4::jsonb)",
        [actor.id, actor.role, result.rows[0].id, JSON.stringify({ channel: "web_push" })],
      );
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
      const result = await client.query<{ id: string }>(`
        UPDATE push_subscriptions
        SET revoked_at = COALESCE(revoked_at, now()),
            updated_at = now()
        WHERE user_id = $1
          AND endpoint = $2
          AND revoked_at IS NULL
        RETURNING id
      `, [actor.id, endpoint]);
      if (result.rows[0]) {
        await client.query(
          "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, $2, 'notification.push_unsubscribed', 'push_subscription', $3, $4::jsonb)",
          [actor.id, actor.role, result.rows[0].id, JSON.stringify({ channel: "web_push" })],
        );
      }
      return { disabled: true, updated: result.rowCount ?? 0 };
    });
  }

  private async ensurePreferences(client: PoolClient, userId: string) {
    await client.query(`
      INSERT INTO notification_preferences (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `, [userId]);
  }

  private async loadPreferences(client: PoolClient, actor: Actor) {
    await this.ensurePreferences(client, actor.id);
    const preferences = await client.query<NotificationPreferenceRow>(`
      SELECT
        push_marketplace AS "marketplacePush",
        push_messages AS "messagesPush",
        push_support AS "supportPush",
        push_system AS "systemPush",
        quiet_hours_enabled AS "quietHoursEnabled",
        to_char(quiet_start, 'HH24:MI') AS "quietStart",
        to_char(quiet_end, 'HH24:MI') AS "quietEnd",
        time_zone AS "timeZone",
        version,
        updated_at AS "updatedAt"
      FROM notification_preferences
      WHERE user_id = $1
    `, [actor.id]);
    const history = await client.query<{ id: string; version: number; createdAt: string }>(`
      SELECT id, version, created_at AS "createdAt"
      FROM notification_preference_events
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 10
    `, [actor.id]);
    const subscriptions = await client.query<{ subscriptionCount: number }>(`
      SELECT count(*)::int AS "subscriptionCount"
      FROM push_subscriptions
      WHERE user_id = $1 AND revoked_at IS NULL
    `, [actor.id]);
    return {
      preferences: preferences.rows[0],
      history: history.rows,
      timeZones: notificationTimeZones,
      channels: {
        inApp: { available: true, enabled: true },
        push: {
          available: Boolean(pushConfiguration()),
          enabled: subscriptions.rows[0].subscriptionCount > 0,
          subscriptionCount: subscriptions.rows[0].subscriptionCount,
        },
        email: { available: false, enabled: false },
        sms: { available: false, enabled: false },
      },
    };
  }

  private preferencesMatch(current: NotificationPreferenceRow, input: NotificationPreferencesInput) {
    return current.marketplacePush === input.marketplacePush
      && current.messagesPush === input.messagesPush
      && current.supportPush === input.supportPush
      && current.systemPush === input.systemPush
      && current.quietHoursEnabled === input.quietHoursEnabled
      && current.quietStart === input.quietStart
      && current.quietEnd === input.quietEnd
      && current.timeZone === input.timeZone;
  }

  private preferenceSnapshot(preference: NotificationPreferenceRow) {
    return {
      marketplacePush: preference.marketplacePush,
      messagesPush: preference.messagesPush,
      supportPush: preference.supportPush,
      systemPush: preference.systemPush,
      quietHoursEnabled: preference.quietHoursEnabled,
      quietStart: preference.quietStart,
      quietEnd: preference.quietEnd,
      timeZone: preference.timeZone,
    };
  }
}
