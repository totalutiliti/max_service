import { Injectable } from "@nestjs/common";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseService } from "../database/database.service.js";
import { PrivateObjectStorageService } from "../storage/private-object-storage.service.js";
import {
  configuredIntegrationChecks,
  summarizeSystemHealth,
  type SystemHealthCheck,
} from "./system-health.js";
import { RequestTelemetryService } from "./request-telemetry.service.js";
import { RateLimitService } from "../security/rate-limit.service.js";

interface DependencyHealthReport {
  policyVersion: string;
  checkedAt: string;
  uptimeSeconds: number;
  summary: ReturnType<typeof summarizeSystemHealth>;
  checks: SystemHealthCheck[];
}

@Injectable()
export class SystemHealthService {
  private cached: { expiresAt: number; report: DependencyHealthReport } | null = null;
  private inspection: Promise<DependencyHealthReport> | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: PrivateObjectStorageService,
    private readonly telemetry: RequestTelemetryService,
    private readonly rateLimits: RateLimitService,
  ) {}

  liveness() {
    return {
      status: "ok",
      service: "max-service-api",
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async inspect() {
    const report = await this.inspectDependencies();
    return {
      ...report,
      telemetry: this.telemetry.snapshot(),
      abuseProtection: this.rateLimits.snapshot(),
    };
  }

  private inspectDependencies() {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return Promise.resolve(this.cached.report);
    }
    if (!this.inspection) {
      this.inspection = this.buildReport()
        .then((report) => {
          this.cached = { expiresAt: Date.now() + 5_000, report };
          return report;
        })
        .finally(() => {
          this.inspection = null;
        });
    }
    return this.inspection;
  }

  private async buildReport(): Promise<DependencyHealthReport> {
    const checks = await Promise.all([
      this.databaseCheck(),
      this.migrationsCheck(),
      this.storageCheck(),
    ]);
    const allChecks = [
      {
        id: "runtime",
        area: "runtime",
        label: "API",
        status: "healthy",
        detail: `Processo ativo há ${Math.floor(process.uptime())} segundo(s).`,
        latencyMs: null,
        trafficBlocking: true,
        productionBlocking: false,
      } satisfies SystemHealthCheck,
      ...checks,
      ...configuredIntegrationChecks(process.env),
    ];
    return {
      policyVersion: "SYSTEM-HEALTH-2026-01",
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      summary: summarizeSystemHealth(allChecks),
      checks: allChecks,
    };
  }

  private async databaseCheck(): Promise<SystemHealthCheck> {
    const startedAt = Date.now();
    try {
      const result = await withTimeout(this.database.query<{
        now: Date;
        runtimeRole: string;
      }>(`
        SELECT
          now() AS now,
          current_user AS "runtimeRole"
      `), 3_000, "Tempo limite ao consultar o PostgreSQL.");
      const runtimeRole = result.rows[0]?.runtimeRole ?? "desconhecida";
      return {
        id: "database",
        area: "database",
        label: "PostgreSQL",
        status: runtimeRole === "max_service_app" ? "healthy" : "attention",
        detail: runtimeRole === "max_service_app"
          ? "Conectado pela role de runtime sem bypass de RLS."
          : "Banco respondeu, mas a role de runtime diverge da configuração esperada.",
        latencyMs: Date.now() - startedAt,
        trafficBlocking: true,
        productionBlocking: runtimeRole !== "max_service_app",
      };
    } catch {
      return {
        id: "database",
        area: "database",
        label: "PostgreSQL",
        status: "critical",
        detail: "Banco indisponível ou acima do tempo limite.",
        latencyMs: Date.now() - startedAt,
        trafficBlocking: true,
        productionBlocking: true,
      };
    }
  }

  private async migrationsCheck(): Promise<SystemHealthCheck> {
    const startedAt = Date.now();
    try {
      const [files, applied] = await withTimeout(Promise.all([
        readdir(join(process.cwd(), "api", "migrations")),
        this.database.query<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name"),
      ]), 3_000, "Tempo limite ao conferir migrations.");
      const expected = files.filter((name) => name.endsWith(".sql")).sort();
      const appliedNames = applied.rows.map((row) => row.name);
      const appliedSet = new Set(appliedNames);
      const expectedSet = new Set(expected);
      const pending = expected.filter((name) => !appliedSet.has(name));
      const unknown = appliedNames.filter((name) => !expectedSet.has(name));
      const synchronized = pending.length === 0 && unknown.length === 0;
      return {
        id: "migrations",
        area: "database",
        label: "Migrations",
        status: synchronized ? "healthy" : "critical",
        detail: synchronized
          ? `${appliedNames.length} migration(ões) aplicadas e sincronizadas com o código.`
          : `${pending.length} pendente(s) e ${unknown.length} desconhecida(s) no banco.`,
        latencyMs: Date.now() - startedAt,
        trafficBlocking: true,
        productionBlocking: !synchronized,
      };
    } catch {
      return {
        id: "migrations",
        area: "database",
        label: "Migrations",
        status: "critical",
        detail: "Não foi possível comprovar a versão do esquema.",
        latencyMs: Date.now() - startedAt,
        trafficBlocking: true,
        productionBlocking: true,
      };
    }
  }

  private async storageCheck(): Promise<SystemHealthCheck> {
    const startedAt = Date.now();
    try {
      await withTimeout(this.storage.health(), 3_000, "Tempo limite ao consultar o cofre.");
      return {
        id: "storage",
        area: "storage",
        label: "Cofre privado",
        status: "healthy",
        detail: "Bucket privado acessível sem expor objetos ou credenciais.",
        latencyMs: Date.now() - startedAt,
        trafficBlocking: true,
        productionBlocking: false,
      };
    } catch {
      return {
        id: "storage",
        area: "storage",
        label: "Cofre privado",
        status: "critical",
        detail: "Armazenamento indisponível ou acima do tempo limite.",
        latencyMs: Date.now() - startedAt,
        trafficBlocking: true,
        productionBlocking: true,
      };
    }
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string) {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
