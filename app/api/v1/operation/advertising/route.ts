import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/operation/advertising", request, "operation");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    campaignId?: string;
    action?: "approve" | "reject" | "pause" | "activate";
    note?: string;
  };
  if (!payload.campaignId || !payload.action) {
    return Response.json({ error: "Campanha ou ação não informada." }, { status: 400 });
  }
  return proxyDemoRequest(
    `/api/v1/operation/advertising/${encodeURIComponent(payload.campaignId)}/actions`,
    request,
    "operation",
    { action: payload.action, note: payload.note },
  );
}
