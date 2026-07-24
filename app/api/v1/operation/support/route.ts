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
      `/api/v1/operation/support/attachments/${encodeURIComponent(attachmentId)}`,
      request,
      "operation",
    );
  }
  const caseId = url.searchParams.get("caseId");
  const path = caseId
    ? `/api/v1/operation/support/cases/${encodeURIComponent(caseId)}`
    : "/api/v1/operation/support";
  return proxyDemoRequest(path, request, "operation");
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
      `/api/v1/operation/support/cases/${encodeURIComponent(caseId)}/attachments`,
      request,
      "operation",
      await file.arrayBuffer(),
      file.type,
      file.name,
      { "x-message-body": encodeURIComponent(body) },
    );
  }

  const payload = await request.json() as {
    action?: "message" | "transition" | "triage" | "dispute_transition";
    caseId?: string;
    body?: string;
    status?: "in_review" | "resolved";
    priority?: "normal" | "high";
    assigneeId?: string;
    note?: string;
    disputeStatus?: "in_review" | "upheld" | "rejected";
  };
  if (!payload.caseId) {
    return Response.json({ error: "caseId é obrigatório." }, { status: 400 });
  }
  if (payload.action === "message") {
    return proxyDemoRequest(
      `/api/v1/operation/support/cases/${encodeURIComponent(payload.caseId)}/messages`,
      request,
      "operation",
      { body: payload.body },
    );
  }
  if (payload.action === "transition") {
    return proxyDemoRequest(
      `/api/v1/operation/support/cases/${encodeURIComponent(payload.caseId)}/transitions`,
      request,
      "operation",
      { status: payload.status, note: payload.note },
    );
  }
  if (payload.action === "triage") {
    return proxyDemoRequest(
      `/api/v1/operation/support/cases/${encodeURIComponent(payload.caseId)}/triage`,
      request,
      "operation",
      { priority: payload.priority, assigneeId: payload.assigneeId, note: payload.note },
    );
  }
  if (payload.action === "dispute_transition") {
    return proxyDemoRequest(
      `/api/v1/operation/support/cases/${encodeURIComponent(payload.caseId)}/disputes/transitions`,
      request,
      "operation",
      { status: payload.disputeStatus, note: payload.note },
    );
  }
  return Response.json({ error: "Ação de atendimento inválida." }, { status: 400 });
}
