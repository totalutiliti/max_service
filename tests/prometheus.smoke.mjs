import assert from "node:assert/strict";

const prometheusBaseUrl = process.env.PROMETHEUS_URL ?? "http://127.0.0.1:59090";
const expectedRules = new Set([
  "MaxServiceApiTargetDown",
  "MaxServiceDependencyCritical",
  "MaxServiceFastErrorBudgetBurn",
  "MaxServiceHighRequestLatency",
  "MaxServiceMetricContractMissing",
  "MaxServiceSlowErrorBudgetBurn",
  "MaxServiceTrafficNotReady",
  "max_service:sli_http_error:ratio_rate1h",
  "max_service:sli_http_error:ratio_rate30m",
  "max_service:sli_http_error:ratio_rate5m",
  "max_service:sli_http_error:ratio_rate6h",
  "max_service:sli_http_latency_p95_seconds:rate5m",
  "max_service:sli_http_requests:rate5m",
]);

async function json(path) {
  const response = await fetch(`${prometheusBaseUrl}${path}`);
  const payload = await response.json();
  assert.equal(
    response.ok,
    true,
    `${response.url} retornou ${response.status}: ${JSON.stringify(payload)}`,
  );
  assert.equal(payload.status, "success");
  return payload.data;
}

async function waitFor(description, inspect, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await inspect();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assert.fail(
    `${description} não ficou disponível no prazo.${lastError ? ` ${lastError}` : ""}`,
  );
}

const ready = await fetch(`${prometheusBaseUrl}/-/ready`);
assert.equal(ready.status, 200);
assert.match(await ready.text(), /ready/i);

const target = await waitFor("A coleta autenticada da API", async () => {
  const targets = await json("/api/v1/targets?state=active");
  const current = targets.activeTargets.find(
    (candidate) => candidate.labels.job === "max-service-api",
  );
  return current?.health === "up" ? current : null;
});
assert.equal(target.labels.service, "max-service-api");
assert.equal(target.lastError, "");
assert.match(target.scrapeUrl, /^http:\/\/api:3001\/internal\/metrics$/);
assert.equal(JSON.stringify(target).includes("max-service-metrics-local-only-2026"), false);

const up = await json(
  `/api/v1/query?query=${encodeURIComponent('up{job="max-service-api"}')}`,
);
assert.equal(up.resultType, "vector");
assert.equal(up.result[0]?.value[1], "1");

const readiness = await json(
  `/api/v1/query?query=${encodeURIComponent('max_service_local_traffic_ready{job="max-service-api"}')}`,
);
assert.equal(readiness.result[0]?.value[1], "1");

const sliCounters = await json(
  `/api/v1/query?query=${encodeURIComponent('max_service_http_application_requests_total{job="max-service-api"}')}`,
);
assert.deepEqual(
  sliCounters.result.map((series) => series.metric.outcome).sort(),
  ["error", "success"],
);

const loadedRules = await waitFor("A avaliação das regras", async () => {
  const rules = await json("/api/v1/rules");
  const current = rules.groups.flatMap((group) => group.rules);
  return current.length === expectedRules.size
    && current.every((rule) => rule.health === "ok")
    ? current
    : null;
});
assert.equal(loadedRules.length, expectedRules.size);
assert.deepEqual(
  new Set(loadedRules.map((rule) => rule.name)),
  expectedRules,
);

const firing = await json(
  `/api/v1/query?query=${encodeURIComponent('ALERTS{alertstate="firing"}')}`,
);
assert.equal(firing.result.length, 0);

console.log(JSON.stringify({
  status: "passed",
  target: target.labels.job,
  targetHealth: target.health,
  rules: loadedRules.length,
  firingAlerts: firing.result.length,
  productionAuthorized: false,
}, null, 2));
