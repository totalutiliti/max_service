import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { runMigrations } from "./database/migrations.js";
import { RequestTelemetryMiddleware } from "./observability/request-telemetry.middleware.js";
import {
  apiCorsAllowedHeaders,
  apiCorsExposedHeaders,
} from "./security/http-security.js";
import { HttpSecurityMiddleware } from "./security/http-security.middleware.js";

async function bootstrap() {
  await runMigrations();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    cors: false,
  });
  const origin = process.env.CORS_ORIGIN ?? "http://127.0.0.1:4174";
  const telemetry = app.get(RequestTelemetryMiddleware);
  const security = app.get(HttpSecurityMiddleware);
  app.use(telemetry.use.bind(telemetry));
  app.use(security.use.bind(security));
  app.useBodyParser("json", { limit: "64kb" });
  app.useBodyParser("urlencoded", { extended: false, limit: "16kb" });
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.enableCors({
    origin,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [...apiCorsAllowedHeaders],
    exposedHeaders: [...apiCorsExposedHeaders],
    credentials: false,
    maxAge: 600,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), "0.0.0.0");
}

void bootstrap();
