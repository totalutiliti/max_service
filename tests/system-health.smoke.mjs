import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.SMOKE_API_URL ?? "http://127.0.0.1:3001";
const webBaseUrl = process.env.SMOKE_WEB_URL ?? "http://127.0.0.1:4174";

async function json(response) {
  const payload = await response.json();
  assert.equal(
    response.ok,
    true,
    `${response.url} retornou ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

async function sessionCookie(role) {
  const response = await fetch(`${webBaseUrl}/api/v1/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
  await json(response);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, `Sessão ${role} não retornou cookie.`);
  return setCookie.split(";", 1)[0];
}

async function concurrentJsonMutation(path, cookie, payload) {
  const idempotencyKey = randomUUID();
  const mutate = () => fetch(`${webBaseUrl}${path}`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  const responses = await Promise.all([mutate(), mutate()]);
  const results = await Promise.all(responses.map((response) => json(response)));
  assert.deepEqual(
    responses.map((response) => response.headers.get("idempotency-replayed")).sort(),
    ["false", "true"],
  );
  return results;
}

async function completeSyntheticBookings(cookie, requestTitle) {
  const payload = await json(await fetch(
    `${webBaseUrl}/api/v1/bookings?role=prestador`,
    { headers: { cookie } },
  ));
  const active = payload.bookings.filter(
    (booking) => booking.requestTitle === requestTitle
      && (booking.status === "scheduled" || booking.status === "in_progress"),
  );
  for (const booking of active) {
    if (booking.status === "scheduled") {
      await json(await fetch(`${webBaseUrl}/api/v1/bookings`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        body: JSON.stringify({
          role: "prestador",
          bookingId: booking.id,
          status: "in_progress",
          note: "Limpeza do cenário sintético idempotente.",
        }),
      }));
    }
    await json(await fetch(`${webBaseUrl}/api/v1/bookings`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({
        role: "prestador",
        bookingId: booking.id,
        status: "completed",
        note: "Cenário sintético idempotente concluído.",
      }),
    }));
  }
}

function shiftedWeeklySchedule(weekly) {
  const target = weekly.find((day) => day.active) ?? weekly[0];
  assert.ok(target, "A agenda sintética precisa conter ao menos um dia.");
  const [startHour, startMinute] = target.startTime.split(":").map(Number);
  const [endHour, endMinute] = target.endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  let nextStart = start;
  let nextEnd = end;
  if (end + 30 <= 23 * 60 + 30) nextEnd += 30;
  else if (start >= 30) nextStart -= 30;
  else nextEnd -= 30;
  const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return weekly.map((day) => day.dayOfWeek === target.dayOfWeek
    ? { ...day, startTime: clock(nextStart), endTime: clock(nextEnd) }
    : day);
}

const livenessResponse = await fetch(`${apiBaseUrl}/health/live`);
assert.match(
  livenessResponse.headers.get("x-request-id") ?? "",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);
assert.equal(livenessResponse.headers.get("x-frame-options"), "DENY");
assert.equal(livenessResponse.headers.get("x-content-type-options"), "nosniff");
assert.equal(livenessResponse.headers.get("cache-control"), "no-store");
assert.match(
  livenessResponse.headers.get("content-security-policy") ?? "",
  /default-src 'none'/,
);
assert.equal(livenessResponse.headers.has("x-powered-by"), false);
assert.equal(livenessResponse.headers.has("strict-transport-security"), false);
const liveness = await json(livenessResponse);
assert.equal(liveness.status, "ok");
assert.equal(liveness.service, "max-service-api");
assert.equal(liveness.telemetry, undefined);

const readiness = await json(await fetch(`${apiBaseUrl}/health/ready`));
assert.equal(readiness.status, "ready");
assert.deepEqual(
  readiness.checks.map((check) => check.id),
  ["runtime", "database", "migrations", "storage"],
);
assert.equal(readiness.checks.every((check) => check.status === "healthy"), true);
assert.equal(readiness.telemetry, undefined);

const preflight = await fetch(`${apiBaseUrl}/health/live`, {
  method: "OPTIONS",
  headers: {
    origin: webBaseUrl,
    "access-control-request-method": "PATCH",
    "access-control-request-headers": "content-type,x-demo-role",
  },
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("access-control-allow-origin"), webBaseUrl);
assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /PATCH/);
assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /x-demo-role/i);
assert.equal(preflight.headers.has("access-control-allow-credentials"), false);

const webLanding = await fetch(webBaseUrl);
assert.equal(webLanding.status, 200);
assert.equal(webLanding.headers.get("x-frame-options"), "DENY");
assert.match(
  webLanding.headers.get("content-security-policy") ?? "",
  /frame-ancestors 'none'/,
);
const webDemo = await fetch(`${webBaseUrl}/demo`);
assert.equal(webDemo.status, 200);
assert.match(webDemo.headers.get("cache-control") ?? "", /no-store/);

const oversized = await fetch(`${apiBaseUrl}/api/v1/campaigns/validate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code: "X".repeat(70 * 1_024) }),
});
assert.equal(oversized.status, 413);
assert.equal(oversized.headers.get("x-content-type-options"), "nosniff");
assert.match(oversized.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);

const customerCookie = await sessionCookie("cliente");
const [categories, regions] = await Promise.all([
  json(await fetch(`${webBaseUrl}/api/v1/categories`, { headers: { cookie: customerCookie } })),
  json(await fetch(`${webBaseUrl}/api/v1/regions`, { headers: { cookie: customerCookie } })),
]);
const category = categories.categories.find((item) => item.slug === "eletricista")
  ?? categories.categories[0];
const region = regions.regions[0];
const neighborhood = region?.neighborhoods[0];
assert.ok(category && region && neighborhood, "Catálogo e cobertura precisam estar semeados.");

const syntheticRequestTitle = "Pedido sintético para prova idempotente";
const requestPayload = {
  categorySlug: category.slug,
  title: syntheticRequestTitle,
  description: "Pedido sintético criado pelo smoke test para validar reenvios concorrentes.",
  regionId: region.id,
  neighborhoodId: neighborhood.id,
  preferredWindow: "O quanto antes",
};
const missingIdempotencyKey = await fetch(`${webBaseUrl}/api/v1/service-requests`, {
  method: "POST",
  headers: {
    cookie: customerCookie,
    "content-type": "application/json",
  },
  body: JSON.stringify(requestPayload),
});
assert.equal(missingIdempotencyKey.status, 400);
assert.match(JSON.stringify(await missingIdempotencyKey.json()), /Idempotency-Key/);

const requestIdempotencyKey = randomUUID();
const createRequest = () => fetch(`${webBaseUrl}/api/v1/service-requests`, {
  method: "POST",
  headers: {
    cookie: customerCookie,
    "content-type": "application/json",
    "idempotency-key": requestIdempotencyKey,
  },
  body: JSON.stringify(requestPayload),
});
const requestResponses = await Promise.all([createRequest(), createRequest()]);
const requestResults = await Promise.all(requestResponses.map((response) => json(response)));
assert.equal(requestResults[0].request.id, requestResults[1].request.id);
assert.deepEqual(
  requestResponses.map((response) => response.headers.get("idempotency-replayed")).sort(),
  ["false", "true"],
);
const requestKeyReuse = await fetch(`${webBaseUrl}/api/v1/service-requests`, {
  method: "POST",
  headers: {
    cookie: customerCookie,
    "content-type": "application/json",
    "idempotency-key": requestIdempotencyKey,
  },
  body: JSON.stringify({ ...requestPayload, title: "Conteúdo diferente com a mesma chave" }),
});
assert.equal(requestKeyReuse.status, 409);
assert.match(JSON.stringify(await requestKeyReuse.json()), /outro conteÃºdo|outro conteúdo/i);

const providerCookie = await sessionCookie("prestador");
await completeSyntheticBookings(providerCookie, syntheticRequestTitle);
const originalSchedule = await json(await fetch(
  `${webBaseUrl}/api/v1/provider/schedule`,
  { headers: { cookie: providerCookie } },
));
const shiftedWeekly = shiftedWeeklySchedule(originalSchedule.weekly);
const weeklyResults = await concurrentJsonMutation(
  "/api/v1/provider/schedule",
  providerCookie,
  { action: "update_weekly", weekly: shiftedWeekly },
);
assert.equal(weeklyResults[0].settings.version, weeklyResults[1].settings.version);
await json(await fetch(`${webBaseUrl}/api/v1/provider/schedule`, {
  method: "POST",
  headers: {
    cookie: providerCookie,
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
  },
  body: JSON.stringify({ action: "update_weekly", weekly: originalSchedule.weekly }),
}));

const syntheticBlockStart = new Date(Date.now() + 150 * 86_400_000);
syntheticBlockStart.setUTCHours(15, 0, 0, 0);
const syntheticBlockEnd = new Date(syntheticBlockStart.getTime() + 60 * 60_000);
const blockResults = await concurrentJsonMutation(
  "/api/v1/provider/schedule",
  providerCookie,
  {
    action: "create_block",
    startsAt: syntheticBlockStart.toISOString(),
    endsAt: syntheticBlockEnd.toISOString(),
    reason: "Bloqueio sintético idempotente.",
  },
);
assert.equal(blockResults[0].block.id, blockResults[1].block.id);
const blockCancellationResults = await concurrentJsonMutation(
  "/api/v1/provider/schedule",
  providerCookie,
  {
    action: "cancel_block",
    blockId: blockResults[0].block.id,
  },
);
assert.equal(blockCancellationResults[0].blockId, blockCancellationResults[1].blockId);
assert.equal(blockCancellationResults[0].status, "cancelled");

const proposalPayload = {
  requestId: requestResults[0].request.id,
  amountCents: 12_500,
  estimatedMinutes: 90,
  message: "Proposta sintética para validar a idempotência concorrente do fluxo.",
};
const proposalIdempotencyKey = randomUUID();
const createProposal = () => fetch(`${webBaseUrl}/api/v1/provider/proposals`, {
  method: "POST",
  headers: {
    cookie: providerCookie,
    "content-type": "application/json",
    "idempotency-key": proposalIdempotencyKey,
  },
  body: JSON.stringify(proposalPayload),
});
const proposalResponses = await Promise.all([createProposal(), createProposal()]);
const proposalResults = await Promise.all(proposalResponses.map((response) => json(response)));
assert.equal(proposalResults[0].proposal.id, proposalResults[1].proposal.id);
assert.deepEqual(
  proposalResponses.map((response) => response.headers.get("idempotency-replayed")).sort(),
  ["false", "true"],
);

const slots = await json(await fetch(
  `${webBaseUrl}/api/v1/customer/proposal-slots?proposalId=${encodeURIComponent(proposalResults[0].proposal.id)}`,
  { headers: { cookie: customerCookie } },
));
assert.ok(slots.slots[0]?.startsAt, "A agenda semeada precisa oferecer ao menos um horário.");
const acceptancePayload = {
  proposalId: proposalResults[0].proposal.id,
  scheduledFor: slots.slots[0].startsAt,
};
const acceptanceIdempotencyKey = randomUUID();
const acceptProposal = () => fetch(`${webBaseUrl}/api/v1/customer/proposals`, {
  method: "POST",
  headers: {
    cookie: customerCookie,
    "content-type": "application/json",
    "idempotency-key": acceptanceIdempotencyKey,
  },
  body: JSON.stringify(acceptancePayload),
});
const acceptanceResponses = await Promise.all([acceptProposal(), acceptProposal()]);
const acceptanceResults = await Promise.all(acceptanceResponses.map((response) => json(response)));
assert.equal(acceptanceResults[0].booking.bookingId, acceptanceResults[1].booking.bookingId);
assert.deepEqual(
  acceptanceResponses.map((response) => response.headers.get("idempotency-replayed")).sort(),
  ["false", "true"],
);
const acceptanceKeyReuse = await fetch(`${webBaseUrl}/api/v1/customer/proposals`, {
  method: "POST",
  headers: {
    cookie: customerCookie,
    "content-type": "application/json",
    "idempotency-key": acceptanceIdempotencyKey,
  },
  body: JSON.stringify({
    ...acceptancePayload,
    scheduledFor: new Date(Date.parse(acceptancePayload.scheduledFor) + 30 * 60_000).toISOString(),
  }),
});
assert.equal(acceptanceKeyReuse.status, 409);
assert.match(JSON.stringify(await acceptanceKeyReuse.json()), /outro conteÃºdo|outro conteúdo/i);

const messageResults = await concurrentJsonMutation(
  "/api/v1/messaging",
  customerCookie,
  {
    role: "cliente",
    conversationId: acceptanceResults[0].booking.conversationId,
    body: "Mensagem sintética idempotente do cliente.",
  },
);
assert.equal(messageResults[0].message.id, messageResults[1].message.id);

const partnerCookie = await sessionCookie("parceiro");
const supportCreateResults = await concurrentJsonMutation(
  "/api/v1/partner/support",
  partnerCookie,
  {
    action: "create",
    topic: "other",
    subject: "Atendimento sintético idempotente",
    body: "Solicitação sintética para provar a abertura concorrente segura.",
  },
);
assert.equal(supportCreateResults[0].case.id, supportCreateResults[1].case.id);
const supportCaseId = supportCreateResults[0].case.id;
const partnerMessageResults = await concurrentJsonMutation(
  "/api/v1/partner/support",
  partnerCookie,
  {
    action: "message",
    caseId: supportCaseId,
    body: "Complemento sintético idempotente do parceiro.",
  },
);
assert.equal(partnerMessageResults[0].event.id, partnerMessageResults[1].event.id);

const forbidden = await fetch(`${webBaseUrl}/api/v1/operation/system-health`, {
  headers: { cookie: customerCookie },
});
assert.equal(forbidden.status, 403);

const unsigned = await fetch(`${apiBaseUrl}/api/v1/operation/system-health`, {
  headers: {
    "x-demo-role": "operation",
    "x-demo-actor-id": "00000000-0000-4000-8000-000000000401",
  },
});
assert.equal(unsigned.status, 401);

const syntheticReferralCode = `PC-${Date.now().toString(36).toUpperCase()}`;
const captureStatuses = [];
let limitedCapture;
for (let attempt = 0; attempt < 6; attempt += 1) {
  const response = await fetch(`${webBaseUrl}/api/v1/public/referrals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: syntheticReferralCode,
      professionalName: "Profissional Sintético",
      email: "synthetic-rate-limit@example.test",
      categorySlug: "eletricista",
      source: "link",
      consent: true,
      website: "",
    }),
  });
  captureStatuses.push(response.status);
  if (attempt === 5) limitedCapture = response;
}
assert.deepEqual(captureStatuses.slice(0, 5).every((status) => status !== 429), true);
assert.equal(limitedCapture?.status, 429);
assert.equal(limitedCapture?.headers.get("ratelimit-limit"), "5");
assert.equal(limitedCapture?.headers.get("ratelimit-remaining"), "0");
assert.match(limitedCapture?.headers.get("retry-after") ?? "", /^\d+$/);
assert.equal((await limitedCapture?.json()).code, "RATE_LIMITED");

const operationCookie = await sessionCookie("operacao");
const operationMessageResults = await concurrentJsonMutation(
  "/api/v1/operation/support",
  operationCookie,
  {
    action: "message",
    caseId: supportCaseId,
    body: "Retorno sintético idempotente da operação.",
  },
);
assert.equal(operationMessageResults[0].event.id, operationMessageResults[1].event.id);

const triageResults = await concurrentJsonMutation(
  "/api/v1/operation/support",
  operationCookie,
  {
    action: "triage",
    caseId: supportCaseId,
    priority: "high",
    assigneeId: "00000000-0000-4000-8000-000000000401",
    note: "Triagem sintética concorrente com prioridade elevada.",
  },
);
assert.equal(triageResults[0].case.id, triageResults[1].case.id);
assert.equal(triageResults[0].case.priority, "high");

const reviewResults = await concurrentJsonMutation(
  "/api/v1/operation/support",
  operationCookie,
  {
    action: "transition",
    caseId: supportCaseId,
    status: "in_review",
    note: "Atendimento sintético assumido pela operação.",
  },
);
assert.equal(reviewResults[0].case.id, reviewResults[1].case.id);
assert.equal(reviewResults[0].case.status, "in_review");

const resolvedResults = await concurrentJsonMutation(
  "/api/v1/operation/support",
  operationCookie,
  {
    action: "transition",
    caseId: supportCaseId,
    status: "resolved",
    note: "Atendimento sintético concluído após validação.",
  },
);
assert.equal(resolvedResults[0].case.id, resolvedResults[1].case.id);
assert.equal(resolvedResults[0].case.status, "resolved");

const bookingId = acceptanceResults[0].booking.bookingId;
const startedBookingResults = await concurrentJsonMutation(
  "/api/v1/bookings",
  providerCookie,
  {
    role: "prestador",
    bookingId,
    status: "in_progress",
    note: "Início sintético idempotente do atendimento.",
  },
);
assert.equal(startedBookingResults[0].booking.id, startedBookingResults[1].booking.id);
assert.equal(startedBookingResults[0].booking.status, "in_progress");

const completedBookingResults = await concurrentJsonMutation(
  "/api/v1/bookings",
  providerCookie,
  {
    role: "prestador",
    bookingId,
    status: "completed",
    note: "Conclusão sintética idempotente do atendimento.",
  },
);
assert.equal(completedBookingResults[0].booking.id, completedBookingResults[1].booking.id);
assert.equal(completedBookingResults[0].booking.status, "completed");

const bookingReviewResults = await concurrentJsonMutation(
  "/api/v1/bookings",
  customerCookie,
  {
    role: "cliente",
    bookingId,
    rating: 5,
    comment: "Avaliação sintética idempotente do atendimento concluído.",
  },
);
assert.equal(bookingReviewResults[0].review.id, bookingReviewResults[1].review.id);

const cancellationRequestResults = await concurrentJsonMutation(
  "/api/v1/service-requests",
  customerCookie,
  {
    ...requestPayload,
    title: "Pedido sintético para cancelamento idempotente",
    description: "Pedido sintético criado para provar um único chamado em cancelamentos concorrentes.",
  },
);
assert.equal(cancellationRequestResults[0].request.id, cancellationRequestResults[1].request.id);

const cancellationProposalResults = await concurrentJsonMutation(
  "/api/v1/provider/proposals",
  providerCookie,
  {
    requestId: cancellationRequestResults[0].request.id,
    amountCents: 13_500,
    estimatedMinutes: 60,
    message: "Proposta sintética para validar o cancelamento concorrente.",
  },
);
assert.equal(cancellationProposalResults[0].proposal.id, cancellationProposalResults[1].proposal.id);
const cancellationSlots = await json(await fetch(
  `${webBaseUrl}/api/v1/customer/proposal-slots?proposalId=${encodeURIComponent(cancellationProposalResults[0].proposal.id)}`,
  { headers: { cookie: customerCookie } },
));
assert.ok(cancellationSlots.slots[0]?.startsAt, "O cancelamento sintético precisa de um horário disponível.");

const cancellationAcceptanceResults = await concurrentJsonMutation(
  "/api/v1/customer/proposals",
  customerCookie,
  {
    proposalId: cancellationProposalResults[0].proposal.id,
    scheduledFor: cancellationSlots.slots[0].startsAt,
  },
);
assert.equal(
  cancellationAcceptanceResults[0].booking.bookingId,
  cancellationAcceptanceResults[1].booking.bookingId,
);
const cancellationResults = await concurrentJsonMutation(
  "/api/v1/bookings",
  customerCookie,
  {
    role: "cliente",
    bookingId: cancellationAcceptanceResults[0].booking.bookingId,
    reasonCode: "schedule_change",
    details: "Cancelamento sintético idempotente solicitado pelo cliente.",
  },
);
assert.equal(cancellationResults[0].cancellation.id, cancellationResults[1].cancellation.id);
assert.equal(cancellationResults[0].case.id, cancellationResults[1].case.id);

const operationCaseId = cancellationResults[0].case.id;
const operationCaseNoteResults = await concurrentJsonMutation(
  "/api/v1/operation/cases",
  operationCookie,
  {
    caseId: operationCaseId,
    action: "note",
    note: "Nota operacional sintética registrada de forma idempotente.",
  },
);
assert.equal(operationCaseNoteResults[0].event.id, operationCaseNoteResults[1].event.id);

const operationCaseReviewResults = await concurrentJsonMutation(
  "/api/v1/operation/cases",
  operationCookie,
  {
    caseId: operationCaseId,
    action: "status",
    status: "in_review",
    note: "Ocorrência sintética assumida pela operação para análise.",
  },
);
assert.equal(operationCaseReviewResults[0].case.id, operationCaseReviewResults[1].case.id);
assert.equal(operationCaseReviewResults[0].case.status, "in_review");

const operationCaseResolutionResults = await concurrentJsonMutation(
  "/api/v1/operation/cases",
  operationCookie,
  {
    caseId: operationCaseId,
    action: "status",
    status: "resolved",
    note: "Ocorrência sintética concluída após a validação operacional.",
  },
);
assert.equal(operationCaseResolutionResults[0].case.id, operationCaseResolutionResults[1].case.id);
assert.equal(operationCaseResolutionResults[0].case.status, "resolved");

await completeSyntheticBookings(providerCookie, syntheticRequestTitle);

const operationHealthResponse = await fetch(
  `${webBaseUrl}/api/v1/operation/system-health`,
  { headers: { cookie: operationCookie } },
);
assert.match(
  operationHealthResponse.headers.get("x-request-id") ?? "",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);
const operationHealth = await json(operationHealthResponse);
assert.equal(operationHealth.summary.localTrafficReady, true);
assert.equal(operationHealth.summary.productionAuthorized, false);
assert.equal(operationHealth.summary.criticalCount, 0);
assert.equal(operationHealth.checks.some((check) => check.id === "payments"), true);
assert.equal(operationHealth.checks.some((check) => check.id === "transport-security"), true);
assert.equal(operationHealth.telemetry.policyVersion, "REQUEST-TELEMETRY-2026-01");
assert.equal(operationHealth.telemetry.probeCount >= 2, true);
assert.equal(operationHealth.telemetry.rejected4xxCount >= 1, true);
assert.equal(operationHealth.telemetry.rateLimitedCount >= 1, true);
assert.equal(operationHealth.telemetry.idempotencyReplayCount >= 23, true);
assert.equal(Array.isArray(operationHealth.telemetry.topRoutes), true);
assert.equal(
  operationHealth.telemetry.topRoutes.every(
    (route) => !route.route.includes("?") && !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(route.route),
  ),
  true,
);
assert.equal(operationHealth.abuseProtection.policyVersion, "ABUSE-PROTECTION-2026-01");
assert.equal(operationHealth.abuseProtection.blockedCount >= 1, true);
assert.equal(
  operationHealth.abuseProtection.blockedByPolicy.some(
    (policy) => policy.policyId === "public-referral-capture-code",
  ),
  true,
);

console.log(JSON.stringify({
  status: "passed",
  probes: ["liveness", "readiness", "security_headers", "cors", "body_limit", "request_id", "operation_cockpit", "role_boundary", "signed_channel", "idempotent_mutations", "idempotent_communications", "idempotent_schedule", "idempotent_booking_lifecycle", "idempotent_operation_commands", "rate_limit", "traffic_metrics"],
  healthyChecks: operationHealth.summary.healthyCount,
  productionBlockers: operationHealth.summary.productionBlockers,
  telemetryRequests: operationHealth.telemetry.requestCount,
}, null, 2));
