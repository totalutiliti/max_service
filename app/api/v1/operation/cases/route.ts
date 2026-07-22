import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const caseId = new URL(request.url).searchParams.get("caseId");
  const path = caseId ? `/api/v1/operation/cases/${encodeURIComponent(caseId)}` : "/api/v1/operation/cases";
  return proxyDemoRequest(path, request, "operation");
}

export async function POST(request: Request) {
  const payload = await request.json() as { caseId?: string; action?: "note" | "status"; status?: string; note?: string };
  if (!payload.caseId) return Response.json({ error: "caseId é obrigatório." }, { status: 400 });
  if (payload.action === "note") {
    return proxyDemoRequest(
      `/api/v1/operation/cases/${encodeURIComponent(payload.caseId)}/notes`,
      request,
      "operation",
      { note: payload.note },
    );
  }
  if (payload.action === "status") {
    return proxyDemoRequest(
      `/api/v1/operation/cases/${encodeURIComponent(payload.caseId)}/transitions`,
      request,
      "operation",
      { status: payload.status, note: payload.note },
    );
  }
  return Response.json({ error: "Ação operacional inválida." }, { status: 400 });
}
