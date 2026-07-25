import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "redis";
import {
  rateLimitPolicies,
  rateLimitPolicyVersion,
  type RateLimitPolicyId,
  type RateLimitRule,
} from "./rate-limit.js";

interface RateLimitBucket {
  policyId: RateLimitPolicyId;
  windowMs: number;
  timestamps: number[];
  lastSeenAt: number;
}

interface RateLimitDecision {
  allowed: boolean;
  policyId: RateLimitPolicyId;
  limit: number;
  remaining: number;
  windowSeconds: number;
  resetAfterSeconds: number;
}

type RateLimitStoreMode = "memory" | "redis";
type RateLimitStoreStatus = "local" | "unknown" | "ready" | "unavailable" | "misconfigured";

interface RateLimitStore {
  consume(
    entries: Array<{ rule: RateLimitRule; opaqueSubject: string }>,
    now: number,
  ): Promise<RateLimitDecision[]>;
  activeBucketCount(now: number): number;
}

const maximumBuckets = 2_000;
const maximumBlockedEvents = 1_000;
const dependencyTimeoutMs = 1_000;
const redisKeyPrefix = "max-service:{rate-limit}:v1";

const redisSlidingWindowScript = `
local server_time = redis.call("TIME")
local now_ms = (tonumber(server_time[1]) * 1000) + math.floor(tonumber(server_time[2]) / 1000)
local member = ARGV[1]
local counts = {}
local resets = {}
local blocked_index = 0

for index, key in ipairs(KEYS) do
  local argument_index = 2 + ((index - 1) * 2)
  local limit = tonumber(ARGV[argument_index])
  local window_ms = tonumber(ARGV[argument_index + 1])
  redis.call("ZREMRANGEBYSCORE", key, "-inf", now_ms - window_ms)
  local count = redis.call("ZCARD", key)
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local reset_ms = window_ms
  if oldest[2] then
    reset_ms = math.max(1, tonumber(oldest[2]) + window_ms - now_ms)
  end
  counts[index] = count
  resets[index] = reset_ms
  if blocked_index == 0 and count >= limit then
    blocked_index = index
  end
end

if blocked_index > 0 then
  return {0, blocked_index, counts[blocked_index], resets[blocked_index]}
end

local result = {1}
for index, key in ipairs(KEYS) do
  local argument_index = 2 + ((index - 1) * 2)
  local window_ms = tonumber(ARGV[argument_index + 1])
  redis.call("ZADD", key, now_ms, member)
  redis.call("PEXPIRE", key, window_ms)
  local count = counts[index] + 1
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local reset_ms = window_ms
  if oldest[2] then
    reset_ms = math.max(1, tonumber(oldest[2]) + window_ms - now_ms)
  end
  table.insert(result, count)
  table.insert(result, reset_ms)
end
return result
`;

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("O coordenador de proteção contra abuso está indisponível.");
    this.name = "RateLimitUnavailableError";
  }
}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitBucket>();

  async consume(
    entries: Array<{ rule: RateLimitRule; opaqueSubject: string }>,
    now: number,
  ) {
    this.prune(now);
    const candidates = entries.map(({ rule, opaqueSubject }) => ({
      rule,
      bucket: this.bucket(rule, opaqueSubject, now),
    }));
    const blocked = candidates.find(({ rule, bucket }) => bucket.timestamps.length >= rule.limit);
    if (blocked) return [this.decision(blocked.rule, blocked.bucket, now, false)];
    return candidates.map(({ rule, bucket }) => {
      bucket.timestamps.push(now);
      bucket.lastSeenAt = now;
      return this.decision(rule, bucket, now, true);
    });
  }

  activeBucketCount(now: number) {
    this.prune(now);
    return this.buckets.size;
  }

  private decision(
    rule: RateLimitRule,
    bucket: RateLimitBucket,
    now: number,
    allowed: boolean,
  ) {
    const oldest = bucket.timestamps[0] ?? now;
    return {
      allowed,
      policyId: rule.policyId,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - bucket.timestamps.length),
      windowSeconds: Math.ceil(rule.windowMs / 1_000),
      resetAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1_000)),
    };
  }

  private bucket(rule: RateLimitRule, opaqueSubject: string, now: number) {
    const key = `${rule.policyId}:${opaqueSubject}`;
    const existing = this.buckets.get(key);
    if (existing) return existing;
    if (this.buckets.size >= maximumBuckets) this.evictOldest();
    const bucket: RateLimitBucket = {
      policyId: rule.policyId,
      windowMs: rule.windowMs,
      timestamps: [],
      lastSeenAt: now,
    };
    this.buckets.set(key, bucket);
    return bucket;
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      const windowStart = now - bucket.windowMs;
      bucket.timestamps = bucket.timestamps.filter((timestamp) => timestamp > windowStart);
      if (bucket.timestamps.length === 0 && bucket.lastSeenAt <= windowStart) {
        this.buckets.delete(key);
      }
    }
  }

  private evictOldest() {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastSeenAt < oldestAt) {
        oldestAt = bucket.lastSeenAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.buckets.delete(oldestKey);
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  private readonly client;
  private readonly observedBuckets = new Map<string, number>();
  private connecting: Promise<void> | null = null;

  constructor(url: string) {
    this.client = createClient({
      url,
      socket: {
        connectTimeout: dependencyTimeoutMs,
        reconnectStrategy: (retries) => (
          retries >= 2 ? false : Math.min(50 * (2 ** retries), 250)
        ),
      },
    });
    this.client.on("error", () => undefined);
  }

  async consume(
    entries: Array<{ rule: RateLimitRule; opaqueSubject: string }>,
    now: number,
  ) {
    await this.ready();
    const keys = entries.map(({ rule, opaqueSubject }) => (
      `${redisKeyPrefix}:${rule.policyId}:${opaqueSubject}`
    ));
    const raw = await withTimeout(this.client.eval(redisSlidingWindowScript, {
      keys,
      arguments: [
        randomUUID(),
        ...entries.flatMap(({ rule }) => [String(rule.limit), String(rule.windowMs)]),
      ],
    }), dependencyTimeoutMs);
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("Resposta inválida do coordenador de rate limit.");
    }
    if (Number(raw[0]) === 0) {
      const blockedIndex = Number(raw[1]) - 1;
      const entry = entries[blockedIndex];
      const count = Number(raw[2]);
      const resetMs = Number(raw[3]);
      if (!entry || !Number.isFinite(count) || !Number.isFinite(resetMs)) {
        throw new Error("Contador inválido do coordenador de rate limit.");
      }
      this.observe(keys[blockedIndex]!, now + entry.rule.windowMs);
      return [this.decision(entry.rule, count, resetMs, false)];
    }
    if (raw.length !== 1 + (entries.length * 2)) {
      throw new Error("Resposta incompleta do coordenador de rate limit.");
    }
    return entries.map((entry, index) => {
      const count = Number(raw[1 + (index * 2)]);
      const resetMs = Number(raw[2 + (index * 2)]);
      if (!Number.isFinite(count) || !Number.isFinite(resetMs)) {
        throw new Error("Contador inválido do coordenador de rate limit.");
      }
      this.observe(keys[index]!, now + entry.rule.windowMs);
      return this.decision(entry.rule, count, resetMs, true);
    });
  }

  activeBucketCount(now: number) {
    for (const [key, expiresAt] of this.observedBuckets) {
      if (expiresAt <= now) this.observedBuckets.delete(key);
    }
    return this.observedBuckets.size;
  }

  async ping() {
    await this.ready();
    const response = await withTimeout(this.client.ping(), dependencyTimeoutMs);
    if (response !== "PONG") throw new Error("Coordenador sem resposta válida.");
  }

  close() {
    if (this.client.isOpen) this.client.destroy();
  }

  private async ready() {
    if (this.client.isReady) return;
    if (!this.client.isOpen) {
      if (!this.connecting) {
        this.connecting = this.client.connect()
          .then(() => undefined)
          .finally(() => {
            this.connecting = null;
          });
      }
      await withTimeout(this.connecting, dependencyTimeoutMs);
    }
    if (!this.client.isReady) {
      await withTimeout(this.client.ping(), dependencyTimeoutMs);
    }
  }

  private decision(
    rule: RateLimitRule,
    count: number,
    resetMs: number,
    allowed: boolean,
  ): RateLimitDecision {
    return {
      allowed,
      policyId: rule.policyId,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      windowSeconds: Math.ceil(rule.windowMs / 1_000),
      resetAfterSeconds: Math.max(1, Math.ceil(resetMs / 1_000)),
    };
  }

  private observe(key: string, expiresAt: number) {
    if (!this.observedBuckets.has(key) && this.observedBuckets.size >= maximumBuckets) {
      let oldestKey: string | null = null;
      let oldestExpiry = Number.POSITIVE_INFINITY;
      for (const [candidate, expiry] of this.observedBuckets) {
        if (expiry < oldestExpiry) {
          oldestKey = candidate;
          oldestExpiry = expiry;
        }
      }
      if (oldestKey) this.observedBuckets.delete(oldestKey);
    }
    this.observedBuckets.set(key, expiresAt);
  }
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly mode: RateLimitStoreMode;
  private readonly subjectKey: Buffer;
  private readonly store: RateLimitStore | null;
  private readonly redisStore: RedisRateLimitStore | null;
  private configurationError: boolean;
  private readonly blockedEvents: Array<{ recordedAt: number; policyId: RateLimitPolicyId }> = [];
  private storeStatus: RateLimitStoreStatus;

  constructor() {
    const configuredMode = process.env.RATE_LIMIT_STORE_MODE?.trim().toLowerCase();
    this.mode = configuredMode === "memory" || configuredMode === "redis"
      ? configuredMode
      : process.env.NODE_ENV === "production"
      ? "redis"
      : "memory";
    const invalidMode = Boolean(configuredMode && configuredMode !== "memory" && configuredMode !== "redis");
    const configuredSecret = process.env.RATE_LIMIT_KEY_SECRET ?? "";
    const redisUrl = process.env.REDIS_URL?.trim() ?? "";
    this.configurationError = invalidMode || (
      this.mode === "redis"
      && (configuredSecret.length < 32 || redisUrl.length === 0)
    );
    this.subjectKey = this.mode === "redis" && !this.configurationError
      ? Buffer.from(configuredSecret, "utf8")
      : randomBytes(32);

    if (this.mode === "memory") {
      this.store = new MemoryRateLimitStore();
      this.redisStore = null;
      this.storeStatus = "local";
      return;
    }

    if (this.configurationError) {
      this.store = null;
      this.redisStore = null;
      this.storeStatus = "misconfigured";
      return;
    }

    let redisStore: RedisRateLimitStore | null = null;
    try {
      redisStore = new RedisRateLimitStore(redisUrl);
    } catch {
      this.configurationError = true;
    }
    this.redisStore = redisStore;
    this.store = redisStore;
    this.storeStatus = redisStore ? "unknown" : "misconfigured";
  }

  async consume(rules: RateLimitRule[], now = Date.now()) {
    if (rules.length === 0) return null;
    this.pruneBlockedEvents(now);
    if (!this.store) throw new RateLimitUnavailableError();

    let decisions: RateLimitDecision[];
    try {
      const entries = rules.map((rule) => {
        const opaqueSubject = createHmac("sha256", this.subjectKey)
          .update(rule.policyId)
          .update("\0")
          .update(rule.subject)
          .digest("hex");
        return { rule, opaqueSubject };
      });
      decisions = await this.store.consume(entries, now);
      if (this.mode === "redis") this.storeStatus = "ready";
    } catch {
      if (this.mode === "redis") this.storeStatus = "unavailable";
      throw new RateLimitUnavailableError();
    }

    const blocked = decisions.find((decision) => !decision.allowed);
    if (blocked) {
      this.recordBlock(now, blocked.policyId);
      return blocked;
    }
    return decisions.sort((left, right) => (
      left.remaining / left.limit - right.remaining / right.limit
    ))[0] ?? null;
  }

  async health() {
    const startedAt = Date.now();
    if (this.mode === "memory") {
      return {
        mode: this.mode,
        status: "local" as const,
        latencyMs: Date.now() - startedAt,
      };
    }
    if (this.configurationError || !this.redisStore) {
      this.storeStatus = "misconfigured";
      return {
        mode: this.mode,
        status: "misconfigured" as const,
        latencyMs: Date.now() - startedAt,
      };
    }
    try {
      await this.redisStore.ping();
      this.storeStatus = "ready";
      return {
        mode: this.mode,
        status: "ready" as const,
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      this.storeStatus = "unavailable";
      return {
        mode: this.mode,
        status: "unavailable" as const,
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  snapshot(now = Date.now()) {
    this.pruneBlockedEvents(now);
    const windowStart = now - 5 * 60_000;
    const recentBlocks = this.blockedEvents.filter((event) => event.recordedAt >= windowStart);
    const counts = new Map<RateLimitPolicyId, number>();
    for (const event of recentBlocks) {
      counts.set(event.policyId, (counts.get(event.policyId) ?? 0) + 1);
    }
    return {
      policyVersion: rateLimitPolicyVersion,
      mode: this.mode === "redis"
        ? "distributed-redis" as const
        : "single-replica-memory" as const,
      storeStatus: this.storeStatus,
      windowMinutes: 5,
      activeBucketCount: this.store?.activeBucketCount(now) ?? 0,
      blockedCount: recentBlocks.length,
      blockedByPolicy: rateLimitPolicies.map((policy) => ({
        policyId: policy.id,
        label: policy.label,
        count: counts.get(policy.id) ?? 0,
      })).filter((policy) => policy.count > 0),
      policies: rateLimitPolicies.map((policy) => ({
        policyId: policy.id,
        label: policy.label,
        limit: policy.limit,
        windowSeconds: policy.windowSeconds,
      })),
      note: this.mode === "redis"
        ? "Contadores coordenados no Redis; agregados de bloqueio permanecem locais à réplica."
        : "Proteção local desta réplica; os contadores reiniciam com o processo.",
    };
  }

  onModuleDestroy() {
    this.redisStore?.close();
  }

  private pruneBlockedEvents(now: number) {
    const blockedWindowStart = now - 5 * 60_000;
    const firstCurrent = this.blockedEvents.findIndex(
      (event) => event.recordedAt >= blockedWindowStart,
    );
    if (firstCurrent === -1) this.blockedEvents.length = 0;
    else if (firstCurrent > 0) this.blockedEvents.splice(0, firstCurrent);
  }

  private recordBlock(recordedAt: number, policyId: RateLimitPolicyId) {
    this.blockedEvents.push({ recordedAt, policyId });
    const overflow = this.blockedEvents.length - maximumBlockedEvents;
    if (overflow > 0) this.blockedEvents.splice(0, overflow);
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Tempo limite no coordenador de rate limit.")),
          timeoutMs,
        );
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
