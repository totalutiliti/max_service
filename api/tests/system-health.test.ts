import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredIntegrationChecks,
  summarizeSystemHealth,
  type SystemHealthCheck,
} from "../observability/system-health.js";

const healthyDependency = (id: string): SystemHealthCheck => ({
  id,
  area: "runtime",
  label: id,
  status: "healthy",
  detail: "ok",
  latencyMs: 1,
  trafficBlocking: true,
  productionBlocking: false,
});

test("considera o tráfego local pronto somente sem bloqueio crítico", () => {
  const healthy = summarizeSystemHealth([
    healthyDependency("api"),
    healthyDependency("database"),
  ]);
  assert.equal(healthy.localTrafficReady, true);
  assert.equal(healthy.productionAuthorized, false);

  const failed = summarizeSystemHealth([
    healthyDependency("api"),
    {
      ...healthyDependency("database"),
      status: "critical",
      productionBlocking: true,
    },
  ]);
  assert.equal(failed.localTrafficReady, false);
  assert.equal(failed.criticalCount, 1);
  assert.equal(failed.trafficBlockers, 1);
});

test("modo demonstrativo e sandbox permanecem bloqueadores de produção", () => {
  const checks = configuredIntegrationChecks({
    DEMO_MODE: "true",
    VAPID_SUBJECT: "",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
  });
  const summary = summarizeSystemHealth(checks);
  assert.equal(checks.find((check) => check.id === "identity")?.status, "attention");
  assert.equal(checks.find((check) => check.id === "payments")?.productionBlocking, true);
  assert.equal(summary.localTrafficReady, true);
  assert.equal(summary.productionAuthorized, false);
  assert.equal(summary.productionBlockers, 2);

  const noDemoWithoutProvider = configuredIntegrationChecks({ DEMO_MODE: "false" });
  assert.equal(noDemoWithoutProvider.find((check) => check.id === "identity")?.status, "attention");
  assert.equal(noDemoWithoutProvider.find((check) => check.id === "identity")?.productionBlocking, true);
});
