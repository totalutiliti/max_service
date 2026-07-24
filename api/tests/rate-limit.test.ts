import assert from "node:assert/strict";
import test from "node:test";
import { requestRateLimitRules, type RateLimitRule } from "../security/rate-limit.js";
import { RateLimitService } from "../security/rate-limit.service.js";

test("protege somente requisições verificadas nas superfícies sensíveis", () => {
  const unsigned = requestRateLimitRules({
    method: "POST",
    originalUrl: "/api/v1/auth/demo-sessions",
    headers: {},
  });
  assert.deepEqual(unsigned, []);

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

test("bloqueia ao atingir a janela, informa reset e libera após expiração", () => {
  const service = new RateLimitService();
  const rules: RateLimitRule[] = [{
    policyId: "public-referral-capture-code",
    subject: "PC-PRIVATE",
    limit: 2,
    windowMs: 1_000,
  }];

  assert.deepEqual(service.consume(rules, 10_000), {
    allowed: true,
    policyId: "public-referral-capture-code",
    limit: 2,
    remaining: 1,
    windowSeconds: 1,
    resetAfterSeconds: 1,
  });
  assert.equal(service.consume(rules, 10_100)?.remaining, 0);

  const blocked = service.consume(rules, 10_200);
  assert.equal(blocked?.allowed, false);
  assert.equal(blocked?.remaining, 0);
  assert.equal(blocked?.resetAfterSeconds, 1);

  const released = service.consume(rules, 11_101);
  assert.equal(released?.allowed, true);
  assert.equal(released?.remaining, 1);
});

test("o diagnóstico expõe apenas agregados e nunca as chaves limitadas", () => {
  const service = new RateLimitService();
  const subject = "sensitive-actor-id";
  const rules: RateLimitRule[] = [{
    policyId: "coupon-validation-customer",
    subject,
    limit: 1,
    windowMs: 60_000,
  }];
  service.consume(rules, 20_000);
  service.consume(rules, 20_001);

  const snapshot = service.snapshot(20_002);
  assert.equal(snapshot.blockedCount, 1);
  assert.equal(snapshot.activeBucketCount, 1);
  assert.equal(snapshot.blockedByPolicy[0]?.policyId, "coupon-validation-customer");
  assert.equal(JSON.stringify(snapshot).includes(subject), false);
});
