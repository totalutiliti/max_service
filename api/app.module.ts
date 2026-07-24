import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { DemoSessionController } from "./auth/demo-session.controller.js";
import { DemoSessionService } from "./auth/demo-session.service.js";
import { InternalAuthMiddleware } from "./auth/internal-auth.middleware.js";
import { BookingsController } from "./bookings/bookings.controller.js";
import { BookingsService } from "./bookings/bookings.service.js";
import { CampaignsController } from "./campaigns/campaigns.controller.js";
import { CampaignsService } from "./campaigns/campaigns.service.js";
import { DatabaseService } from "./database/database.service.js";
import { FinanceController } from "./finance/finance.controller.js";
import { FinanceService } from "./finance/finance.service.js";
import { MarketplaceController } from "./marketplace/marketplace.controller.js";
import { MarketplaceService } from "./marketplace/marketplace.service.js";
import { MessagingController } from "./messaging/messaging.controller.js";
import { MessagingService } from "./messaging/messaging.service.js";
import { NotificationsController } from "./notifications/notifications.controller.js";
import { NotificationsService } from "./notifications/notifications.service.js";
import { PushDeliveryService } from "./notifications/push-delivery.service.js";
import { OnboardingController } from "./onboarding/onboarding.controller.js";
import { OnboardingService } from "./onboarding/onboarding.service.js";
import { ObservabilityController } from "./observability/observability.controller.js";
import { SystemHealthService } from "./observability/system-health.service.js";
import { OperationsController } from "./operations/operations.controller.js";
import { OperationsService } from "./operations/operations.service.js";
import { PartnersController, PublicReferralsController } from "./partners/partners.controller.js";
import { PartnersService } from "./partners/partners.service.js";
import { PrivateObjectStorageService } from "./storage/private-object-storage.service.js";
import { OperationSupportController, PartnerSupportController } from "./support/partner-support.controller.js";
import { PartnerSupportService } from "./support/partner-support.service.js";
import { OperationVerificationsController, ProviderVerificationController } from "./verifications/verifications.controller.js";
import { VerificationsService } from "./verifications/verifications.service.js";

@Module({
  controllers: [ObservabilityController, DemoSessionController, OnboardingController, MarketplaceController, CampaignsController, MessagingController, BookingsController, OperationsController, NotificationsController, PartnersController, PublicReferralsController, PartnerSupportController, OperationSupportController, ProviderVerificationController, OperationVerificationsController, FinanceController],
  providers: [DatabaseService, DemoSessionService, OnboardingService, InternalAuthMiddleware, PrivateObjectStorageService, SystemHealthService, MarketplaceService, CampaignsService, MessagingService, BookingsService, OperationsService, NotificationsService, PushDeliveryService, PartnersService, PartnerSupportService, VerificationsService, FinanceService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(InternalAuthMiddleware).forRoutes("*");
  }
}
