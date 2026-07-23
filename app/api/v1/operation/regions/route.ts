import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/operation/regions", request, "operation");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    target?: "region" | "neighborhood";
    id?: string;
    action?: "activate" | "deactivate";
    note?: string;
  };
  if (!payload.id || !payload.target) {
    return Response.json({ error: "Região ou bairro não informado." }, { status: 400 });
  }
  const resource = payload.target === "region" ? "regions" : "region-neighborhoods";
  return proxyDemoRequest(
    `/api/v1/operation/${resource}/${encodeURIComponent(payload.id)}/actions`,
    request,
    "operation",
    { action: payload.action, note: payload.note },
  );
}
