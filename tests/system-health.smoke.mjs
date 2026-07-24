import assert from "node:assert/strict";

const apiBaseUrl = process.env.SMOKE_API_URL ?? "http://127.0.0.1:3001";
const webBaseUrl = process.env.SMOKE_WEB_URL ?? "http://127.0.0.1:4174";

async function json(response) {
  const payload = await response.json();
  assert.equal(
    response.ok,
    true,
    `${response.url} retornou ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

async function sessionCookie(role) {
  const response = await fetch(`${webBaseUrl}/api/v1/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
  await json(response);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, `Sessão ${role} não retornou cookie.`);
  return setCookie.split(";", 1)[0];
}

const liveness = await json(await fetch(`${apiBaseUrl}/health/live`));
assert.equal(liveness.status, "ok");
assert.equal(liveness.service, "max-service-api");

const readiness = await json(await fetch(`${apiBaseUrl}/health/ready`));
assert.equal(readiness.status, "ready");
assert.deepEqual(
  readiness.checks.map((check) => check.id),
  ["runtime", "database", "migrations", "storage"],
);
assert.equal(readiness.checks.every((check) => check.status === "healthy"), true);

const operationCookie = await sessionCookie("operacao");
const operationHealth = await json(await fetch(
  `${webBaseUrl}/api/v1/operation/system-health`,
  { headers: { cookie: operationCookie } },
));
assert.equal(operationHealth.summary.localTrafficReady, true);
assert.equal(operationHealth.summary.productionAuthorized, false);
assert.equal(operationHealth.summary.criticalCount, 0);
assert.equal(operationHealth.checks.some((check) => check.id === "payments"), true);

const customerCookie = await sessionCookie("cliente");
const forbidden = await fetch(`${webBaseUrl}/api/v1/operation/system-health`, {
  headers: { cookie: customerCookie },
});
assert.equal(forbidden.status, 403);

const unsigned = await fetch(`${apiBaseUrl}/api/v1/operation/system-health`, {
  headers: {
    "x-demo-role": "operation",
    "x-demo-actor-id": "00000000-0000-4000-8000-000000000401",
  },
});
assert.equal(unsigned.status, 401);

console.log(JSON.stringify({
  status: "passed",
  probes: ["liveness", "readiness", "operation_cockpit", "role_boundary", "signed_channel"],
  healthyChecks: operationHealth.summary.healthyCount,
  productionBlockers: operationHealth.summary.productionBlockers,
}, null, 2));
