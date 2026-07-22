import assert from "node:assert/strict";
import test from "node:test";
import { demoActorIds, parseDemoActor } from "../auth/demo-actor.js";
import { computeInternalSignature, verifyInternalSignature } from "../auth/internal-signature.js";
import { computeSandboxSignature, verifySandboxSignature } from "../finance/finance-signature.js";

test("aceita somente a identidade correspondente ao perfil demonstrativo", () => {
  assert.deepEqual(parseDemoActor("customer", demoActorIds.customer, true), {
    id: demoActorIds.customer,
    role: "customer",
  });
  assert.throws(() => parseDemoActor("provider", demoActorIds.customer, true), /Identidade/);
});

test("bloqueia cabeçalhos demonstrativos fora do modo de demonstração", () => {
  assert.throws(() => parseDemoActor("customer", demoActorIds.customer, false), /desativado/);
});

test("assina eventos financeiros sandbox de forma determinística e rejeita adulteração", () => {
  const event = {
    eventId: "95000000-0000-4000-8000-000000000001",
    intentId: "96000000-0000-4000-8000-000000000001",
    eventType: "settlement" as const,
    amountCents: 9500,
  };
  const signature = computeSandboxSignature("segredo-local-de-teste", "1784746800", event);
  assert.equal(verifySandboxSignature("segredo-local-de-teste", "1784746800", event, signature), true);
  assert.equal(verifySandboxSignature("segredo-local-de-teste", "1784746800", { ...event, amountCents: 9501 }, signature), false);
});

test("vincula a identidade interna ao método e ao caminho da requisição", () => {
  const timestamp = "1784746800";
  const path = "/api/v1/bookings";
  const signature = computeInternalSignature(
    "segredo-bff-de-teste",
    timestamp,
    "GET",
    path,
    "customer",
    demoActorIds.customer,
  );
  assert.equal(
    verifyInternalSignature("segredo-bff-de-teste", timestamp, "GET", path, "customer", demoActorIds.customer, signature),
    true,
  );
  assert.equal(
    verifyInternalSignature("segredo-bff-de-teste", timestamp, "POST", path, "customer", demoActorIds.customer, signature),
    false,
  );
  assert.equal(
    verifyInternalSignature("segredo-bff-de-teste", timestamp, "GET", path, "operation", demoActorIds.operation, signature),
    false,
  );
});
