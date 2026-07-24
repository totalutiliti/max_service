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
