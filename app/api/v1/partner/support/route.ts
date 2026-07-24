import {
  proxyDemoBinaryRequest,
  proxyDemoDownloadRequest,
  proxyDemoRequest,
} from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const attachmentId = url.searchParams.get("attachmentId");
  if (attachmentId) {
    return proxyDemoDownloadRequest(
      `/api/v1/partner/support/attachments/${encodeURIComponent(attachmentId)}`,
      request,
      "partner",
    );
  }
  const caseId = url.searchParams.get("caseId");
  const path = caseId
    ? `/api/v1/partner/support/cases/${encodeURIComponent(caseId)}`
    : "/api/v1/partner/support";
  return proxyDemoRequest(path, request, "partner");
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > 2_200_000) {
      return Response.json({ error: "O arquivo excede o limite de 2 MB." }, { status: 413 });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "Formulário de anexo inválido." }, { status: 400 });
    }
    const caseValue = form.get("caseId");
    const bodyValue = form.get("body");
    const caseId = typeof caseValue === "string" ? caseValue : "";
    const body = typeof bodyValue === "string" ? bodyValue.trim() : "";
    const file = form.get("file");
    if (!caseId) return Response.json({ error: "caseId é obrigatório." }, { status: 400 });
    if (!(file instanceof File)) return Response.json({ error: "Selecione um arquivo." }, { status: 400 });
    if (file.size < 4 || file.size > 2_097_152) {
      return Response.json({ error: "O arquivo deve ter entre 4 bytes e 2 MB." }, { status: 413 });
    }
    if (!new Set(["application/pdf", "image/jpeg", "image/png"]).has(file.type)) {
      return Response.json({ error: "Envie somente PDF, JPEG ou PNG." }, { status: 400 });
    }
    if (body.length > 2000) {
      return Response.json({ error: "A mensagem deve ter no máximo 2.000 caracteres." }, { status: 400 });
    }
    return proxyDemoBinaryRequest(
      `/api/v1/partner/support/cases/${encodeURIComponent(caseId)}/attachments`,
      request,
      "partner",
      await file.arrayBuffer(),
      file.type,
      file.name,
      { "x-message-body": encodeURIComponent(body) },
    );
  }

  const payload = await request.json() as {
    action?: "create" | "message" | "dispute";
    caseId?: string;
    topic?: "referral" | "account" | "finance_sandbox" | "other";
    subject?: string;
    body?: string;
    referralId?: string;
    reason?: "resolution_incomplete" | "evidence_not_considered" | "commercial_divergence" | "other";
    statement?: string;
  };

  if (payload.action === "create") {
    return proxyDemoRequest("/api/v1/partner/support/cases", request, "partner", {
      topic: payload.topic,
      subject: payload.subject,
      body: payload.body,
      referralId: payload.referralId || undefined,
    });
  }
  if (payload.action === "message" && payload.caseId) {
    return proxyDemoRequest(
      `/api/v1/partner/support/cases/${encodeURIComponent(payload.caseId)}/messages`,
      request,
      "partner",
      { body: payload.body },
    );
  }
  if (payload.action === "dispute" && payload.caseId) {
    return proxyDemoRequest(
      `/api/v1/partner/support/cases/${encodeURIComponent(payload.caseId)}/disputes`,
      request,
      "partner",
      { reason: payload.reason, statement: payload.statement },
    );
  }
  return Response.json({ error: "Ação de atendimento inválida." }, { status: 400 });
}
