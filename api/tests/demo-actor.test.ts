import assert from "node:assert/strict";
import test from "node:test";
import { demoActorIds, parseDemoActor } from "../auth/demo-actor.js";
import { computeInternalSignature, verifyInternalSignature } from "../auth/internal-signature.js";
import { computeSandboxSignature, verifySandboxSignature } from "../finance/finance-signature.js";
import { maximumRequestAttachmentBytes, validateRequestAttachment } from "../marketplace/request-attachment-validation.js";
import {
  maximumPartnerSupportAttachmentBytes,
  validatePartnerSupportAttachment,
} from "../support/partner-support-attachment-validation.js";
import { validatePushSubscription } from "../notifications/push-subscription-validation.js";
import { maximumProviderDocumentBytes, validateProviderDocumentFile } from "../verifications/document-file-validation.js";

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

test("valida nome, tamanho, MIME e assinatura binária de documento", () => {
  const pdf = Buffer.from("%PDF-1.4\nsynthetic\n%%EOF\n");
  assert.equal(validateProviderDocumentFile("pasta\\comprovante.pdf", "application/pdf", pdf), "comprovante.pdf");
  assert.throws(
    () => validateProviderDocumentFile("falso.pdf", "application/pdf", Buffer.from("conteúdo adulterado")),
    /assinatura/,
  );
  assert.throws(
    () => validateProviderDocumentFile("grande.png", "image/png", Buffer.alloc(maximumProviderDocumentBytes + 1)),
    /2 MB/,
  );
});

test("aceita somente imagens de pedido coerentes com MIME, extensão e assinatura", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  assert.equal(validateRequestAttachment("pasta\\problema.png", "image/png", png), "problema.png");
  assert.throws(
    () => validateRequestAttachment("falso.png", "image/png", Buffer.from("imagem adulterada")),
    /assinatura/,
  );
  assert.throws(
    () => validateRequestAttachment("grande.jpg", "image/jpeg", Buffer.alloc(maximumRequestAttachmentBytes + 1)),
    /512 KB/,
  );
});

test("valida anexos privados da central por nome, tipo, tamanho e assinatura", () => {
  const pdf = Buffer.from("%PDF-1.7\nsynthetic support file\n%%EOF\n");
  assert.equal(
    validatePartnerSupportAttachment("evidencias\\retorno.pdf", "application/pdf", pdf),
    "retorno.pdf",
  );
  assert.throws(
    () => validatePartnerSupportAttachment("retorno.pdf", "application/pdf", Buffer.from("arquivo adulterado")),
    /assinatura/,
  );
  assert.throws(
    () => validatePartnerSupportAttachment(
      "grande.png",
      "image/png",
      Buffer.alloc(maximumPartnerSupportAttachmentBytes + 1),
    ),
    /2 MB/,
  );
});

test("aceita somente assinaturas push HTTPS com chaves Web Push válidas", () => {
  const subscription = validatePushSubscription({
    endpoint: "https://push.example.test/subscriptions/device-01",
    expirationTime: null,
    keys: {
      p256dh: "BOV-zZnXYcbOZQsTsmmFyBq0fSn0GqVxA0spNOhcC-OEP_-cDslYPb-kNebFNaKZTa0xRlZjMaUf46R41aTLhxg",
      auth: "AAAAAAAAAAAAAAAAAAAAAA",
    },
  });
  assert.equal(subscription.endpoint, "https://push.example.test/subscriptions/device-01");
  assert.equal(subscription.keys.auth, "AAAAAAAAAAAAAAAAAAAAAA");
  assert.throws(
    () => validatePushSubscription({ ...subscription, endpoint: "http://push.example.test/device" }),
    /Endpoint/,
  );
  assert.throws(
    () => validatePushSubscription({ ...subscription, keys: { ...subscription.keys, auth: "curta" } }),
    /autenticação/,
  );
});
