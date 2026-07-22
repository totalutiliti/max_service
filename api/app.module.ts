import { Controller, Get, Module } from "@nestjs/common";
import { BookingsController } from "./bookings/bookings.controller.js";
import { BookingsService } from "./bookings/bookings.service.js";
import { DatabaseService } from "./database/database.service.js";
import { MarketplaceController } from "./marketplace/marketplace.controller.js";
import { MarketplaceService } from "./marketplace/marketplace.service.js";
import { MessagingController } from "./messaging/messaging.controller.js";
import { MessagingService } from "./messaging/messaging.service.js";
import { NotificationsController } from "./notifications/notifications.controller.js";
import { NotificationsService } from "./notifications/notifications.service.js";
import { OperationsController } from "./operations/operations.controller.js";
import { OperationsService } from "./operations/operations.service.js";

@Controller()
class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get("health")
  async health() {
    const database = await this.database.health();
    return { status: "ok", service: "max-service-api", database: database.now };
  }
}

@Module({
  controllers: [HealthController, MarketplaceController, MessagingController, BookingsController, OperationsController, NotificationsController],
  providers: [DatabaseService, MarketplaceService, MessagingService, BookingsService, OperationsService, NotificationsService],
})
export class AppModule {}
