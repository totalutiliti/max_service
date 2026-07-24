export type SystemHealthStatus = "healthy" | "attention" | "critical";

export interface SystemHealthCheck {
  id: string;
  area: "runtime" | "database" | "storage" | "security" | "integration";
  label: string;
  status: SystemHealthStatus;
  detail: string;
  latencyMs: number | null;
  trafficBlocking: boolean;
  productionBlocking: boolean;
}

export function summarizeSystemHealth(checks: SystemHealthCheck[]) {
  const healthyCount = checks.filter((check) => check.status === "healthy").length;
  const attentionCount = checks.filter((check) => check.status === "attention").length;
  const criticalCount = checks.filter((check) => check.status === "critical").length;
  const trafficBlockers = checks.filter(
    (check) => check.trafficBlocking && check.status !== "healthy",
  ).length;
  const productionBlockers = checks.filter(
    (check) => check.productionBlocking && check.status !== "healthy",
  ).length;
  return {
    totalCount: checks.length,
    healthyCount,
    attentionCount,
    criticalCount,
    trafficBlockers,
    productionBlockers,
    localTrafficReady: trafficBlockers === 0,
    productionAuthorized: false as const,
  };
}

export function configuredIntegrationChecks(environment: NodeJS.ProcessEnv): SystemHealthCheck[] {
  const demoMode = environment.DEMO_MODE === "true";
  const identityConfigured = !demoMode && environment.IDENTITY_PROVIDER_CONFIGURED === "true";
  const pushConfigured = Boolean(
    environment.VAPID_SUBJECT
    && environment.VAPID_PUBLIC_KEY
    && environment.VAPID_PRIVATE_KEY,
  );
  const transportConfigured = environment.TRANSPORT_SECURITY_CONFIGURED === "true";
  return [
    {
      id: "identity",
      area: "security",
      label: "Identidade",
      status: identityConfigured ? "healthy" : "attention",
      detail: identityConfigured
        ? "Provedor de identidade informado como homologado neste ambiente."
        : demoMode
        ? "Sessões demonstrativas ativas; provedor de identidade e MFA ainda não homologados."
        : "Modo demonstrativo desativado, mas o provedor de identidade ainda não foi homologado.",
      latencyMs: null,
      trafficBlocking: false,
      productionBlocking: !identityConfigured,
    },
    {
      id: "transport-security",
      area: "security",
      label: "Transporte HTTPS",
      status: transportConfigured ? "healthy" : "attention",
      detail: transportConfigured
        ? "HTTPS e HSTS informados como homologados neste ambiente."
        : "Headers defensivos ativos; terminação HTTPS e HSTS ainda não homologados.",
      latencyMs: null,
      trafficBlocking: false,
      productionBlocking: !transportConfigured,
    },
    {
      id: "payments",
      area: "integration",
      label: "Pagamentos",
      status: "attention",
      detail: "Processador financeiro em sandbox; nenhum PSP real está habilitado.",
      latencyMs: null,
      trafficBlocking: false,
      productionBlocking: true,
    },
    {
      id: "push",
      area: "integration",
      label: "Web Push",
      status: pushConfigured ? "healthy" : "attention",
      detail: pushConfigured
        ? "Canal Web Push local configurado."
        : "Canal opcional sem chaves VAPID neste ambiente.",
      latencyMs: null,
      trafficBlocking: false,
      productionBlocking: false,
    },
  ];
}
