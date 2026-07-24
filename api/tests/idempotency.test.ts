import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalJson,
  idempotencyDerivedUuid,
  idempotencyRequestHash,
  validateIdempotencyKey,
} from "../idempotency/idempotency.js";

test("normaliza o payload antes de calcular a impressão idempotente", () => {
  const first = {
    scheduledFor: "2026-07-25T12:30:00.000Z",
    proposal: { amountCents: 12_500, tags: ["urgente", "piloto"] },
  };
  const reordered = {
    proposal: { tags: ["urgente", "piloto"], amountCents: 12_500 },
    scheduledFor: "2026-07-25T12:30:00.000Z",
  };

  assert.equal(canonicalJson(first), canonicalJson(reordered));
  assert.equal(idempotencyRequestHash(first), idempotencyRequestHash(reordered));
  assert.match(idempotencyRequestHash(first), /^[0-9a-f]{64}$/);
});

test("aceita chaves opacas seguras e rejeita formatos ambíguos", () => {
  assert.equal(
    validateIdempotencyKey("550e8400-e29b-41d4-a716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000",
  );
  assert.throws(() => validateIdempotencyKey("curta"), /16 a 80/);
  assert.throws(() => validateIdempotencyKey(" 550e8400-e29b-41d4-a716-446655440000"), /16 a 80/);
  assert.throws(() => validateIdempotencyKey("repeticao.com.pontos.nao.permitidos"), /16 a 80/);
});

test("deriva identificadores UUID estáveis e isolados para efeitos binários", () => {
  const first = idempotencyDerivedUuid(["customer", "actor-1", "/upload", "opaque-key-123456", "file"]);
  const replay = idempotencyDerivedUuid(["customer", "actor-1", "/upload", "opaque-key-123456", "file"]);
  const other = idempotencyDerivedUuid(["customer", "actor-1", "/upload", "opaque-key-123456", "event"]);

  assert.equal(first, replay);
  assert.notEqual(first, other);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
