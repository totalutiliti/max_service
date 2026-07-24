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

const livenessResponse = await fetch(`${apiBaseUrl}/health/live`);
assert.match(
  livenessResponse.headers.get("x-request-id") ?? "",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);
assert.equal(livenessResponse.headers.get("x-frame-options"), "DENY");
assert.equal(livenessResponse.headers.get("x-content-type-options"), "nosniff");
assert.equal(livenessResponse.headers.get("cache-control"), "no-store");
assert.match(
  livenessResponse.headers.get("content-security-policy") ?? "",
  /default-src 'none'/,
);
assert.equal(livenessResponse.headers.has("x-powered-by"), false);
assert.equal(livenessResponse.headers.has("strict-transport-security"), false);
const liveness = await json(livenessResponse);
assert.equal(liveness.status, "ok");
assert.equal(liveness.service, "max-service-api");
assert.equal(liveness.telemetry, undefined);

const readiness = await json(await fetch(`${apiBaseUrl}/health/ready`));
assert.equal(readiness.status, "ready");
assert.deepEqual(
  readiness.checks.map((check) => check.id),
  ["runtime", "database", "migrations", "storage"],
);
assert.equal(readiness.checks.every((check) => check.status === "healthy"), true);
assert.equal(readiness.telemetry, undefined);

const preflight = await fetch(`${apiBaseUrl}/health/live`, {
  method: "OPTIONS",
  headers: {
    origin: webBaseUrl,
    "access-control-request-method": "PATCH",
    "access-control-request-headers": "content-type,x-demo-role",
  },
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("access-control-allow-origin"), webBaseUrl);
assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /PATCH/);
assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /x-demo-role/i);
assert.equal(preflight.headers.has("access-control-allow-credentials"), false);

const webLanding = await fetch(webBaseUrl);
assert.equal(webLanding.status, 200);
assert.equal(webLanding.headers.get("x-frame-options"), "DENY");
assert.match(
  webLanding.headers.get("content-security-policy") ?? "",
  /frame-ancestors 'none'/,
);
const webDemo = await fetch(`${webBaseUrl}/demo`);
assert.equal(webDemo.status, 200);
assert.match(webDemo.headers.get("cache-control") ?? "", /no-store/);

const oversized = await fetch(`${apiBaseUrl}/api/v1/campaigns/validate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code: "X".repeat(70 * 1_024) }),
});
assert.equal(oversized.status, 413);
assert.equal(oversized.headers.get("x-content-type-options"), "nosniff");
assert.match(oversized.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);

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

const syntheticReferralCode = `PC-${Date.now().toString(36).toUpperCase()}`;
const captureStatuses = [];
let limitedCapture;
for (let attempt = 0; attempt < 6; attempt += 1) {
  const response = await fetch(`${webBaseUrl}/api/v1/public/referrals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: syntheticReferralCode,
      professionalName: "Profissional Sintético",
      email: "synthetic-rate-limit@example.test",
      categorySlug: "eletricista",
      source: "link",
      consent: true,
      website: "",
    }),
  });
  captureStatuses.push(response.status);
  if (attempt === 5) limitedCapture = response;
}
assert.deepEqual(captureStatuses.slice(0, 5).every((status) => status !== 429), true);
assert.equal(limitedCapture?.status, 429);
assert.equal(limitedCapture?.headers.get("ratelimit-limit"), "5");
assert.equal(limitedCapture?.headers.get("ratelimit-remaining"), "0");
assert.match(limitedCapture?.headers.get("retry-after") ?? "", /^\d+$/);
assert.equal((await limitedCapture?.json()).code, "RATE_LIMITED");

const operationCookie = await sessionCookie("operacao");
const operationHealthResponse = await fetch(
  `${webBaseUrl}/api/v1/operation/system-health`,
  { headers: { cookie: operationCookie } },
);
assert.match(
  operationHealthResponse.headers.get("x-request-id") ?? "",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);
const operationHealth = await json(operationHealthResponse);
assert.equal(operationHealth.summary.localTrafficReady, true);
assert.equal(operationHealth.summary.productionAuthorized, false);
assert.equal(operationHealth.summary.criticalCount, 0);
assert.equal(operationHealth.checks.some((check) => check.id === "payments"), true);
assert.equal(operationHealth.checks.some((check) => check.id === "transport-security"), true);
assert.equal(operationHealth.telemetry.policyVersion, "REQUEST-TELEMETRY-2026-01");
assert.equal(operationHealth.telemetry.probeCount >= 2, true);
assert.equal(operationHealth.telemetry.rejected4xxCount >= 1, true);
assert.equal(operationHealth.telemetry.rateLimitedCount >= 1, true);
assert.equal(Array.isArray(operationHealth.telemetry.topRoutes), true);
assert.equal(
  operationHealth.telemetry.topRoutes.every(
    (route) => !route.route.includes("?") && !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(route.route),
  ),
  true,
);
assert.equal(operationHealth.abuseProtection.policyVersion, "ABUSE-PROTECTION-2026-01");
assert.equal(operationHealth.abuseProtection.blockedCount >= 1, true);
assert.equal(
  operationHealth.abuseProtection.blockedByPolicy.some(
    (policy) => policy.policyId === "public-referral-capture-code",
  ),
  true,
);

console.log(JSON.stringify({
  status: "passed",
  probes: ["liveness", "readiness", "security_headers", "cors", "body_limit", "request_id", "operation_cockpit", "role_boundary", "signed_channel", "rate_limit", "traffic_metrics"],
  healthyChecks: operationHealth.summary.healthyCount,
  productionBlockers: operationHealth.summary.productionBlockers,
  telemetryRequests: operationHealth.telemetry.requestCount,
}, null, 2));
