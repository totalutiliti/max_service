import assert from "node:assert/strict";
import test, { after } from "node:test";
import { requestRateLimitRules, type RateLimitRule } from "../security/rate-limit.js";
import { RateLimitMiddleware } from "../security/rate-limit.middleware.js";
import {
  RateLimitService,
  RateLimitUnavailableError,
} from "../security/rate-limit.service.js";

const originalRateLimitEnvironment = {
  mode: process.env.RATE_LIMIT_STORE_MODE,
  redisUrl: process.env.REDIS_URL,
  keySecret: process.env.RATE_LIMIT_KEY_SECRET,
};
process.env.RATE_LIMIT_STORE_MODE = "memory";

after(() => {
  restoreEnvironment("RATE_LIMIT_STORE_MODE", originalRateLimitEnvironment.mode);
  restoreEnvironment("REDIS_URL", originalRateLimitEnvironment.redisUrl);
  restoreEnvironment("RATE_LIMIT_KEY_SECRET", originalRateLimitEnvironment.keySecret);
});

test("protege somente requisições verificadas nas superfícies sensíveis", () => {
  const unsigned = requestRateLimitRules({
    method: "POST",
    originalUrl: "/api/v1/auth/demo-sessions",
    headers: {},
  });
  assert.deepEqual(unsigned, []);

  const demoSession = requestRateLimitRules({
    method: "POST",
    originalUrl: "/api/v1/auth/demo-sessions",
    headers: { "x-bff-verified": "1" },
  });
  assert.equal(demoSession[0]?.limit, 60);

  const capture = requestRateLimitRules({
    method: "POST",
    originalUrl: "/api/v1/public/referrals/PC-PRIVATE",
    headers: {
      "x-bff-verified": "1",
      "x-demo-role": "public_referral",
    },
  });
  assert.deepEqual(
    capture.map((rule) => rule.policyId),
    ["public-referral-capture-global", "public-referral-capture-code"],
  );

  const coupon = requestRateLimitRules({
    method: "POST",
    originalUrl: "/api/v1/campaigns/validate",
    headers: {
      "x-bff-verified": "1",
      "x-demo-role": "customer",
      "x-demo-actor-id": "customer-private-id",
    },
  });
  assert.deepEqual(
    coupon.map((rule) => rule.policyId),
    ["coupon-validation-global", "coupon-validation-customer"],
  );
});

test("bloqueia ao atingir a janela, informa reset e libera após expiração", async () => {
  const service = new RateLimitService();
  const rules: RateLimitRule[] = [{
    policyId: "public-referral-capture-code",
    subject: "PC-PRIVATE",
    limit: 2,
    windowMs: 1_000,
  }];

  assert.deepEqual(await service.consume(rules, 10_000), {
    allowed: true,
    policyId: "public-referral-capture-code",
    limit: 2,
    remaining: 1,
    windowSeconds: 1,
    resetAfterSeconds: 1,
  });
  assert.equal((await service.consume(rules, 10_100))?.remaining, 0);

  const blocked = await service.consume(rules, 10_200);
  assert.equal(blocked?.allowed, false);
  assert.equal(blocked?.remaining, 0);
  assert.equal(blocked?.resetAfterSeconds, 1);

  const released = await service.consume(rules, 11_101);
  assert.equal(released?.allowed, true);
  assert.equal(released?.remaining, 1);
});

test("o diagnóstico expõe apenas agregados e nunca as chaves limitadas", async () => {
  const service = new RateLimitService();
  const subject = "sensitive-actor-id";
  const rules: RateLimitRule[] = [{
    policyId: "coupon-validation-customer",
    subject,
    limit: 1,
    windowMs: 60_000,
  }];
  await service.consume(rules, 20_000);
  await service.consume(rules, 20_001);

  const snapshot = service.snapshot(20_002);
  assert.equal(snapshot.blockedCount, 1);
  assert.equal(snapshot.activeBucketCount, 1);
  assert.equal(snapshot.blockedByPolicy[0]?.policyId, "coupon-validation-customer");
  assert.equal(JSON.stringify(snapshot).includes(subject), false);
});

test("memória local fica explícita como bloqueador de produção", async () => {
  const service = new RateLimitService();
  const health = await service.health();
  assert.equal(health.mode, "memory");
  assert.equal(health.status, "local");
  assert.equal(service.snapshot().mode, "single-replica-memory");
});

test("fecha rotas protegidas quando o coordenador obrigatório falha", async () => {
  const service = {
    consume: async () => {
      throw new RateLimitUnavailableError();
    },
  } as RateLimitService;
  const middleware = new RateLimitMiddleware(service);
  const headers = new Map<string, string>();
  let statusCode = 200;
  let payload: unknown;
  let nextCalled = false;
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
    },
  };

  await middleware.use({
    method: "POST",
    originalUrl: "/api/v1/auth/demo-sessions",
    headers: { "x-bff-verified": "1" },
  }, response, () => {
    nextCalled = true;
  });

  assert.equal(statusCode, 503);
  assert.equal(headers.get("retry-after"), "1");
  assert.equal(headers.get("cache-control"), "no-store");
  assert.deepEqual(payload, {
    statusCode: 503,
    error: "Service Unavailable",
    code: "RATE_LIMIT_STORE_UNAVAILABLE",
    message: "Proteção contra abuso temporariamente indisponível.",
  });
  assert.equal(nextCalled, false);
});

test("modo Redis sem segredo e URL válidos permanece fechado", async () => {
  process.env.RATE_LIMIT_STORE_MODE = "redis";
  delete process.env.REDIS_URL;
  delete process.env.RATE_LIMIT_KEY_SECRET;
  try {
    const service = new RateLimitService();
    const health = await service.health();
    assert.equal(health.mode, "redis");
    assert.equal(health.status, "misconfigured");
    await assert.rejects(
      service.consume([{
        policyId: "demo-session-create",
        subject: "global",
        limit: 1,
        windowMs: 1_000,
      }]),
      RateLimitUnavailableError,
    );
  } finally {
    process.env.RATE_LIMIT_STORE_MODE = "memory";
    restoreEnvironment("REDIS_URL", originalRateLimitEnvironment.redisUrl);
    restoreEnvironment("RATE_LIMIT_KEY_SECRET", originalRateLimitEnvironment.keySecret);
  }
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
