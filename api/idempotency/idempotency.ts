import { createHash } from "node:crypto";

const idempotencyKeyPattern = /^[A-Za-z0-9_-]{16,80}$/;

export function validateIdempotencyKey(value: string | undefined) {
  if (!value || value !== value.trim() || !idempotencyKeyPattern.test(value)) {
    throw new Error("Idempotency-Key deve conter de 16 a 80 caracteres alfanuméricos, hífen ou sublinhado.");
  }
  return value;
}

export function idempotencyRequestHash(payload: unknown) {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function idempotencyDerivedUuid(parts: readonly string[]) {
  const bytes = createHash("sha256").update(canonicalJson(parts)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}
