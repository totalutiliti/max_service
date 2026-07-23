import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/provider/schedule", request, "provider");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    action?: "update_weekly" | "create_block" | "cancel_block";
    weekly?: unknown;
    startsAt?: string;
    endsAt?: string;
    reason?: string;
    blockId?: string;
  };
  if (payload.action === "update_weekly") {
    return proxyDemoRequest(
      "/api/v1/provider/schedule/weekly",
      request,
      "provider",
      { weekly: payload.weekly },
    );
  }
  if (payload.action === "create_block") {
    return proxyDemoRequest(
      "/api/v1/provider/schedule/blocks",
      request,
      "provider",
      { startsAt: payload.startsAt, endsAt: payload.endsAt, reason: payload.reason },
    );
  }
  if (payload.action === "cancel_block" && payload.blockId) {
    return proxyDemoRequest(
      `/api/v1/provider/schedule/blocks/${encodeURIComponent(payload.blockId)}/cancel`,
      request,
      "provider",
      {},
    );
  }
  return Response.json({ error: "Ação de agenda inválida." }, { status: 400 });
}
