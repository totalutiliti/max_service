import { Injectable } from "@nestjs/common";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Actor } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import {
  checksumMigrationSql,
  inspectMigrationState,
  validateMigrationNames,
} from "../database/migrations.js";
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

  async inspect(actor?: Actor) {
    const report = await this.inspectDependencies();
    const privateStorageReconciliation = actor?.role === "operation"
      ? await this.latestPrivateStorageReconciliation(actor)
      : null;
    return {
      ...report,
      telemetry: this.telemetry.snapshot(),
      abuseProtection: this.rateLimits.snapshot(),
      privateStorageReconciliation,
    };
  }

  dependencySnapshot() {
    return this.inspectDependencies();
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
      this.rateLimitStoreCheck(),
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
      const migrationsDirectory = join(process.cwd(), "api", "migrations");
      const { expected, applied } = await withTimeout((async () => {
        const names = validateMigrationNames(
          (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")),
        );
        const [descriptors, records] = await Promise.all([
          Promise.all(names.map(async (name) => {
            const sql = await readFile(join(migrationsDirectory, name), "utf8");
            return { name, sql, checksum: checksumMigrationSql(sql) };
          })),
          this.database.query<{ name: string; checksum: string | null }>(
            "SELECT name, checksum FROM schema_migrations ORDER BY name",
          ),
        ]);
        return { expected: descriptors, applied: records };
      })(), 3_000, "Tempo limite ao conferir migrations.");
      const state = inspectMigrationState(expected, applied.rows);
      const synchronized = state.pending.length === 0 && state.backfill.length === 0;
      return {
        id: "migrations",
        area: "database",
        label: "Migrations",
        status: synchronized ? "healthy" : "critical",
        detail: synchronized
          ? `${applied.rows.length} migration(ões) aplicadas, ordenadas e íntegras.`
          : `${state.pending.length} pendente(s) e ${state.backfill.length} sem checksum verificável.`,
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

  private async rateLimitStoreCheck(): Promise<SystemHealthCheck> {
    const health = await this.rateLimits.health();
    if (health.status === "ready") {
      return {
        id: "rate-limit-store",
        area: "security",
        label: "Rate limit distribuído",
        status: "healthy",
        detail: "Redis acessível; contadores compartilhados entre réplicas e falha fechada ativos.",
        latencyMs: health.latencyMs,
        trafficBlocking: true,
        productionBlocking: false,
      };
    }
    if (health.status === "local") {
      return {
        id: "rate-limit-store",
        area: "security",
        label: "Rate limit local",
        status: "attention",
        detail: "Contadores somente em memória; adequado ao desenvolvimento isolado, não à produção.",
        latencyMs: health.latencyMs,
        trafficBlocking: false,
        productionBlocking: true,
      };
    }
    return {
      id: "rate-limit-store",
      area: "security",
      label: "Rate limit distribuído",
      status: "critical",
      detail: health.status === "misconfigured"
        ? "Redis obrigatório sem configuração válida; rotas protegidas permanecem fechadas."
        : "Redis indisponível; rotas protegidas permanecem fechadas.",
      latencyMs: health.latencyMs,
      trafficBlocking: true,
      productionBlocking: true,
    };
  }

  private latestPrivateStorageReconciliation(actor: Actor) {
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<{
        runId: string;
        policyVersion: string;
        mode: "dry_run" | "apply";
        status: "running" | "succeeded" | "failed";
        cutoffAt: Date;
        startedAt: Date;
        completedAt: Date | null;
        listedObjects: number;
        referencedObjects: number;
        managedOrphans: number;
        eligibleOrphans: number;
        recentOrphans: number;
        missingReferences: number;
        sizeMismatches: number;
        ignoredObjects: number;
        deletedObjects: number;
        raceProtectedObjects: number;
      }>(`
        SELECT
          id AS "runId",
          policy_version AS "policyVersion",
          mode,
          status,
          cutoff_at AS "cutoffAt",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          listed_objects AS "listedObjects",
          referenced_objects AS "referencedObjects",
          managed_orphans AS "managedOrphans",
          eligible_orphans AS "eligibleOrphans",
          recent_orphans AS "recentOrphans",
          missing_references AS "missingReferences",
          size_mismatches AS "sizeMismatches",
          ignored_objects AS "ignoredObjects",
          deleted_objects AS "deletedObjects",
          race_protected_objects AS "raceProtectedObjects"
        FROM private_storage_reconciliation_runs
        ORDER BY started_at DESC
        LIMIT 1
      `);
      const row = result.rows[0];
      if (!row) return null;
      return {
        ...row,
        cutoffAt: row.cutoffAt.toISOString(),
        startedAt: row.startedAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
      };
    });
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
