import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const caseId = new URL(request.url).searchParams.get("caseId");
  const path = caseId
    ? `/api/v1/operation/support/cases/${encodeURIComponent(caseId)}`
    : "/api/v1/operation/support";
  return proxyDemoRequest(path, request, "operation");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    action?: "message" | "transition" | "triage";
    caseId?: string;
    body?: string;
    status?: "in_review" | "resolved";
    priority?: "normal" | "high";
    assigneeId?: string;
    note?: string;
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
  return Response.json({ error: "Ação de atendimento inválida." }, { status: 400 });
}
