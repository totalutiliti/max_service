import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import webpush from "web-push";
import { DatabaseService } from "../database/database.service.js";
import { pushConfiguration } from "./push-config.js";

interface ClaimedPushDelivery extends QueryResultRow {
  notification_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string;
  attempts: number;
}

@Injectable()
export class PushDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushDeliveryService.name);
  private readonly configuration = pushConfiguration();
  private timer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(private readonly database: DatabaseService) {
    if (this.configuration) {
      webpush.setVapidDetails(
        this.configuration.subject,
        this.configuration.publicKey,
        this.configuration.privateKey,
      );
    }
  }

  onModuleInit() {
    if (!this.configuration) {
      this.logger.warn("Web Push desativado: configuração VAPID ausente.");
      return;
    }
    this.timer = setInterval(() => void this.dispatch(), 5_000);
    this.timer.unref();
    void this.dispatch();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async dispatch() {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const result = await this.database.query<ClaimedPushDelivery>(
        "SELECT * FROM claim_notification_push_deliveries($1)",
        [20],
      );
      await Promise.allSettled(result.rows.map((delivery) => this.deliver(delivery)));
    } catch (error) {
      this.logger.error(`Falha ao consultar a fila Web Push: ${this.errorMessage(error)}`);
    } finally {
      this.dispatching = false;
    }
  }

  private async deliver(delivery: ClaimedPushDelivery) {
    try {
      await webpush.sendNotification(
        {
          endpoint: delivery.endpoint,
          keys: { p256dh: delivery.p256dh, auth: delivery.auth },
        },
        JSON.stringify({
          title: delivery.title,
          body: delivery.body,
          tag: `max-service-${delivery.entity_type}-${delivery.entity_id}`,
          data: {
            url: `/demo?notification=${encodeURIComponent(delivery.notification_id)}`,
            notificationId: delivery.notification_id,
          },
        }),
        { TTL: 60 * 60, urgency: "normal" },
      );
      await this.finish(delivery, "sent");
    } catch (error) {
      const statusCode = this.statusCode(error);
      await this.finish(delivery, statusCode === 404 || statusCode === 410 ? "gone" : "retry", this.errorMessage(error));
    }
  }

  private async finish(delivery: ClaimedPushDelivery, result: "sent" | "gone" | "retry", error?: string) {
    try {
      await this.database.query(
        "SELECT finish_notification_push_delivery($1, $2, $3, $4)",
        [delivery.notification_id, delivery.subscription_id, result, error ?? null],
      );
    } catch (finishError) {
      this.logger.error(`Falha ao finalizar uma entrega Web Push: ${this.errorMessage(finishError)}`);
    }
  }

  private statusCode(error: unknown) {
    return typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) return error.message.slice(0, 500);
    return "erro desconhecido";
  }
}
