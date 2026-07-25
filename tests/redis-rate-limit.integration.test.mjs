import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "redis";
import { RedisRateLimitStore } from "../.api-dist/api/security/rate-limit.service.js";

const redisUrl = process.env.TEST_REDIS_URL
  ?? "redis://:max-service-redis-local-only@127.0.0.1:56379/0";

test("duas réplicas compartilham o mesmo limite atômico no Redis", async () => {
  const firstReplica = new RedisRateLimitStore(redisUrl);
  const secondReplica = new RedisRateLimitStore(redisUrl);
  const cleanup = createClient({ url: redisUrl });
  cleanup.on("error", () => undefined);
  const opaqueSubject = randomUUID().replaceAll("-", "");
  const key = `max-service:{rate-limit}:v1:public-referral-capture-code:${opaqueSubject}`;
  const rule = {
    policyId: "public-referral-capture-code",
    subject: "não persistir este valor",
    limit: 2,
    windowMs: 10_000,
  };

  try {
    const entries = [{ rule, opaqueSubject }];
    const [first] = await firstReplica.consume(entries, Date.now());
    const [second] = await secondReplica.consume(entries, Date.now());
    const [blocked] = await firstReplica.consume(entries, Date.now());

    assert.equal(first.allowed, true);
    assert.equal(first.remaining, 1);
    assert.equal(second.allowed, true);
    assert.equal(second.remaining, 0);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
  } finally {
    await cleanup.connect();
    await cleanup.del(key);
    cleanup.destroy();
    firstReplica.close();
    secondReplica.close();
  }
});

test("políticas compostas bloqueiam sem consumir parcialmente outro contador", async () => {
  const firstReplica = new RedisRateLimitStore(redisUrl);
  const secondReplica = new RedisRateLimitStore(redisUrl);
  const cleanup = createClient({ url: redisUrl });
  cleanup.on("error", () => undefined);
  const suffix = randomUUID().replaceAll("-", "");
  const globalSubject = `global-${suffix}`;
  const firstCodeSubject = `code-a-${suffix}`;
  const secondCodeSubject = `code-b-${suffix}`;
  const globalRule = {
    policyId: "public-referral-capture-global",
    subject: "global",
    limit: 3,
    windowMs: 10_000,
  };
  const codeRule = {
    policyId: "public-referral-capture-code",
    subject: "convite",
    limit: 1,
    windowMs: 10_000,
  };
  const keys = [
    `max-service:{rate-limit}:v1:${globalRule.policyId}:${globalSubject}`,
    `max-service:{rate-limit}:v1:${codeRule.policyId}:${firstCodeSubject}`,
    `max-service:{rate-limit}:v1:${codeRule.policyId}:${secondCodeSubject}`,
  ];

  try {
    const first = await firstReplica.consume([
      { rule: globalRule, opaqueSubject: globalSubject },
      { rule: codeRule, opaqueSubject: firstCodeSubject },
    ], Date.now());
    const blocked = await secondReplica.consume([
      { rule: globalRule, opaqueSubject: globalSubject },
      { rule: codeRule, opaqueSubject: firstCodeSubject },
    ], Date.now());
    const nextSubject = await firstReplica.consume([
      { rule: globalRule, opaqueSubject: globalSubject },
      { rule: codeRule, opaqueSubject: secondCodeSubject },
    ], Date.now());

    assert.equal(first.every((decision) => decision.allowed), true);
    assert.equal(blocked[0]?.allowed, false);
    assert.equal(blocked[0]?.policyId, "public-referral-capture-code");
    assert.equal(nextSubject[0]?.policyId, "public-referral-capture-global");
    assert.equal(nextSubject[0]?.remaining, 1);
  } finally {
    await cleanup.connect();
    await cleanup.del(keys);
    cleanup.destroy();
    firstReplica.close();
    secondReplica.close();
  }
});
