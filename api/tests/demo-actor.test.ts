import assert from "node:assert/strict";
import test from "node:test";
import { demoActorIds, parseDemoActor } from "../auth/demo-actor.js";

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
