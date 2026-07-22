import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { runMigrations } from "./database/migrations.js";

async function bootstrap() {
  await runMigrations();
  const app = await NestFactory.create(AppModule, { cors: false });
  const origin = process.env.CORS_ORIGIN ?? "http://127.0.0.1:4174";
  app.enableCors({ origin, methods: ["GET", "POST", "OPTIONS"], credentials: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), "0.0.0.0");
}

void bootstrap();
