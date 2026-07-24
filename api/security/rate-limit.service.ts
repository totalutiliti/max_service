import { Injectable } from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
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
  policyId: RateLimitPolicyId;
  limit: number;
  remaining: number;
  windowSeconds: number;
  resetAfterSeconds: number;
}

const maximumBuckets = 2_000;
const maximumBlockedEvents = 1_000;

@Injectable()
export class RateLimitService {
  private readonly processSalt = randomBytes(32);
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly blockedEvents: Array<{ recordedAt: number; policyId: RateLimitPolicyId }> = [];

  consume(rules: RateLimitRule[], now = Date.now()) {
    if (rules.length === 0) return null;
    this.prune(now);
    const decisions = rules.map((rule) => this.decision(rule, now));
    const blocked = decisions.find((decision) => decision.remaining === 0);

    if (blocked) {
      this.recordBlock(now, blocked.policyId);
      return { allowed: false as const, ...blocked };
    }

    const consumed = rules.map((rule) => {
      const bucket = this.bucket(rule, now);
      bucket.timestamps.push(now);
      bucket.lastSeenAt = now;
      return this.decision(rule, now);
    });
    const mostConstrained = consumed.sort((left, right) => (
      left.remaining / left.limit - right.remaining / right.limit
    ))[0]!;
    return { allowed: true as const, ...mostConstrained };
  }

  snapshot(now = Date.now()) {
    this.prune(now);
    const windowStart = now - 5 * 60_000;
    const recentBlocks = this.blockedEvents.filter((event) => event.recordedAt >= windowStart);
    const counts = new Map<RateLimitPolicyId, number>();
    for (const event of recentBlocks) {
      counts.set(event.policyId, (counts.get(event.policyId) ?? 0) + 1);
    }
    return {
      policyVersion: rateLimitPolicyVersion,
      mode: "single-replica-memory" as const,
      windowMinutes: 5,
      activeBucketCount: this.buckets.size,
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
      note: "Proteção local desta réplica; os contadores reiniciam com o processo.",
    };
  }

  private decision(rule: RateLimitRule, now: number): RateLimitDecision {
    const bucket = this.bucket(rule, now);
    const oldest = bucket.timestamps[0] ?? now;
    return {
      policyId: rule.policyId,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - bucket.timestamps.length),
      windowSeconds: Math.ceil(rule.windowMs / 1_000),
      resetAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1_000)),
    };
  }

  private bucket(rule: RateLimitRule, now: number) {
    const key = `${rule.policyId}:${createHmac("sha256", this.processSalt)
      .update(rule.subject)
      .digest("hex")}`;
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
    const blockedWindowStart = now - 5 * 60_000;
    const firstCurrent = this.blockedEvents.findIndex(
      (event) => event.recordedAt >= blockedWindowStart,
    );
    if (firstCurrent === -1) this.blockedEvents.length = 0;
    else if (firstCurrent > 0) this.blockedEvents.splice(0, firstCurrent);
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

  private recordBlock(recordedAt: number, policyId: RateLimitPolicyId) {
    this.blockedEvents.push({ recordedAt, policyId });
    const overflow = this.blockedEvents.length - maximumBlockedEvents;
    if (overflow > 0) this.blockedEvents.splice(0, overflow);
  }
}
