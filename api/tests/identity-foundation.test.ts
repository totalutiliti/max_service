import assert from "node:assert/strict";
import test from "node:test";
import {
  identitySubjectDigest,
  normalizeIdentityIdentifier,
  progressiveLockout,
  uniformAuthenticationFailure,
} from "../auth/identity-abuse.js";
import {
  IdentityConfigurationError,
  identityRuntimeConfiguration,
  requireProductionIdentity,
} from "../auth/identity-config.js";
import {
  IdentityProviderRegistry,
  IdentityProviderUnavailableError,
  type IdentityProviderAdapter,
} from "../auth/identity-provider.js";
import { identitySessionPolicy } from "../auth/identity-session-policy.js";
import {
  createIdentitySessionToken,
  hashIdentitySessionToken,
  requireIdentitySessionToken,
} from "../auth/identity-session-token.js";
import { demoActorIds, parseDemoActor } from "../auth/demo-actor.js";

test("identidade de produção permanece fechada sem decisão explícita de provedor", () => {
  assert.deepEqual(
    identityRuntimeConfiguration({
      DEMO_MODE: "true",
      PRODUCTION_IDENTITY_ENABLED: "true",
      IDENTITY_PROVIDER_MODE: "external_oidc",
    }),
    {
      demoMode: true,
      productionFeatureEnabled: true,
      providerMode: "external_oidc",
      ready: false,
      blockedReason: "O modo demonstrativo está ativo.",
    },
  );
  assert.throws(
    () => requireProductionIdentity({
      DEMO_MODE: "false",
      PRODUCTION_IDENTITY_ENABLED: "true",
      IDENTITY_PROVIDER_MODE: "disabled",
    }),
    IdentityConfigurationError,
  );
  assert.equal(
    requireProductionIdentity({
      DEMO_MODE: "false",
      PRODUCTION_IDENTITY_ENABLED: "true",
      IDENTITY_PROVIDER_MODE: "external_oidc",
    }).providerMode,
    "external_oidc",
  );
});

test("registry não finge que um adapter selecionado está homologado", () => {
  const registry = new IdentityProviderRegistry();
  assert.throws(
    () => registry.selected({
      DEMO_MODE: "false",
      PRODUCTION_IDENTITY_ENABLED: "true",
      IDENTITY_PROVIDER_MODE: "external_oidc",
    }),
    IdentityProviderUnavailableError,
  );

  const adapter = {
    mode: "external_oidc",
    providerKey: "test-only",
    authenticate: async () => {
      throw new Error("não chamado");
    },
  } satisfies IdentityProviderAdapter;
  registry.register(adapter);
  assert.equal(
    registry.selected({
      DEMO_MODE: "false",
      PRODUCTION_IDENTITY_ENABLED: "true",
      IDENTITY_PROVIDER_MODE: "external_oidc",
    }),
    adapter,
  );
  assert.throws(() => registry.register(adapter), /Mais de um adapter/);
});

test("tokens de sessão são opacos, aleatórios, validados e persistidos por hash", () => {
  const first = createIdentitySessionToken();
  const second = createIdentitySessionToken();
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.token, second.token);
  assert.equal(hashIdentitySessionToken(first.token), first.tokenHash);
  assert.throws(() => requireIdentitySessionToken("curto"), /inválido/);
});

test("parâmetros de sessão precisam ser explícitos e respeitar limites seguros", () => {
  assert.deepEqual(identitySessionPolicy({
    IDENTITY_SESSION_ABSOLUTE_MINUTES: "720",
    IDENTITY_SESSION_IDLE_MINUTES: "60",
    IDENTITY_SESSION_ROTATION_MINUTES: "15",
  }), {
    absoluteMinutes: 720,
    idleMinutes: 60,
    rotationMinutes: 15,
  });
  assert.throws(() => identitySessionPolicy({}), /ABSOLUTE/);
  assert.throws(() => identitySessionPolicy({
    IDENTITY_SESSION_ABSOLUTE_MINUTES: "60",
    IDENTITY_SESSION_IDLE_MINUTES: "120",
    IDENTITY_SESSION_ROTATION_MINUTES: "15",
  }), /IDLE/);
});

test("normaliza conta, gera assunto opaco e aplica bloqueio progressivo", () => {
  assert.equal(
    normalizeIdentityIdentifier("  USUÁRIO@EXEMPLO.COM "),
    "usuário@exemplo.com",
  );
  const digest = identitySubjectDigest(
    "identity-lookup-key-for-test-only-2026",
    "Usuário@Exemplo.com",
  );
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(progressiveLockout(4).blocked, false);
  assert.deepEqual(progressiveLockout(5), {
    failedAttemptCount: 5,
    lockSeconds: 60,
    blocked: true,
  });
  assert.equal(progressiveLockout(8).lockSeconds, 900);
  assert.equal(progressiveLockout(12).lockSeconds, 86_400);
  assert.equal(uniformAuthenticationFailure.message.includes("existe"), false);
});

test("ator dinâmico só é aceito com a feature real e nunca reutiliza UUID demo", () => {
  const previous = process.env.PRODUCTION_IDENTITY_ENABLED;
  process.env.PRODUCTION_IDENTITY_ENABLED = "true";
  try {
    assert.deepEqual(
      parseDemoActor(
        "customer",
        "8cf6f188-c386-4da0-8146-6449bb00ea60",
        false,
      ),
      {
        id: "8cf6f188-c386-4da0-8146-6449bb00ea60",
        role: "customer",
      },
    );
    assert.throws(
      () => parseDemoActor("customer", demoActorIds.customer, false),
      /produção inválida/,
    );
    assert.throws(
      () => parseDemoActor("operation", "identidade-controlada-pelo-cliente", false),
      /produção inválida/,
    );
  } finally {
    if (previous === undefined) delete process.env.PRODUCTION_IDENTITY_ENABLED;
    else process.env.PRODUCTION_IDENTITY_ENABLED = previous;
  }
});
