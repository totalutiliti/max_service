import { Controller, Get, Module } from "@nestjs/common";
import { DatabaseService } from "./database/database.service.js";
import { MarketplaceController } from "./marketplace/marketplace.controller.js";
import { MarketplaceService } from "./marketplace/marketplace.service.js";

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
  controllers: [HealthController, MarketplaceController],
  providers: [DatabaseService, MarketplaceService],
})
export class AppModule {}
