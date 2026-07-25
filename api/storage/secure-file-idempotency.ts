import { createHash } from "node:crypto";
import type {
  IdempotencyClaim,
  SecureFileIdempotencyStore,
} from "./secure-file-contracts.js";

export class SecureFileIdempotencyConflictError extends Error {
  constructor() {
    super("A chave idempotente já foi usada com outro conteúdo.");
    this.name = "SecureFileIdempotencyConflictError";
  }
}

export class SecureFileIdempotencyInProgressError extends Error {
  constructor() {
    super("A operação idempotente ainda está em processamento.");
    this.name = "SecureFileIdempotencyInProgressError";
  }
}

export function secureFileRequestHash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export async function executeSecureFileIdempotently<T>(
  store: SecureFileIdempotencyStore<T>,
  key: string,
  request: unknown,
  operation: (claim: IdempotencyClaim) => Promise<T>,
) {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) {
    throw new Error("Chave idempotente inválida.");
  }
  const requestHash = secureFileRequestHash(request);
  const beginning = await store.begin(key, requestHash);
  if (beginning.status === "REPLAY") return { value: beginning.response, replayed: true };
  if (beginning.status === "CONFLICT") throw new SecureFileIdempotencyConflictError();
  if (beginning.status === "IN_PROGRESS") throw new SecureFileIdempotencyInProgressError();

  try {
    const value = await operation(beginning.claim);
    await store.complete(beginning.claim, value);
    return { value, replayed: false };
  } catch (error) {
    await store.release(beginning.claim);
    throw error;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}
