import { createHmac, timingSafeEqual } from "node:crypto";

export function internalRequestCanonical(
  timestamp: string,
  method: string,
  path: string,
  role = "",
  actorId = "",
  idempotencyKey = "",
) {
  return `${timestamp}.${method.toUpperCase()}.${path}.${role}.${actorId}${idempotencyKey ? `.${idempotencyKey}` : ""}`;
}

export function computeInternalSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  role = "",
  actorId = "",
  idempotencyKey = "",
) {
  return `sha256=${createHmac("sha256", secret)
    .update(internalRequestCanonical(timestamp, method, path, role, actorId, idempotencyKey))
    .digest("hex")}`;
}

export function verifyInternalSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  role: string,
  actorId: string,
  received: string,
  idempotencyKey = "",
) {
  const expected = Buffer.from(computeInternalSignature(secret, timestamp, method, path, role, actorId, idempotencyKey));
  const candidate = Buffer.from(received);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
