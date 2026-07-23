import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/operation/campaigns", request, "operation");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    action?: "create" | "activate" | "pause";
    campaignId?: string;
    campaign?: Record<string, unknown>;
    note?: string;
  };
  if (payload.action === "create") {
    return proxyDemoRequest("/api/v1/operation/campaigns", request, "operation", payload.campaign ?? {});
  }
  if (!payload.campaignId || !payload.action) {
    return Response.json({ error: "Campanha ou ação não informada." }, { status: 400 });
  }
  return proxyDemoRequest(
    `/api/v1/operation/campaigns/${encodeURIComponent(payload.campaignId)}/actions`,
    request,
    "operation",
    { action: payload.action, note: payload.note },
  );
}
