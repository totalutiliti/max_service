import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/operation/readiness", request, "operation");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    gateKey?: string;
    status?: "blocked" | "in_progress" | "evidence_ready";
    ownerLabel?: string;
    evidence?: string;
    expectedVersion?: number;
    note?: string;
  };
  if (!payload.gateKey) {
    return Response.json({ error: "gateKey é obrigatório." }, { status: 400 });
  }
  const { gateKey, ...input } = payload;
  return proxyDemoRequest(
    `/api/v1/operation/readiness/${encodeURIComponent(gateKey)}`,
    request,
    "operation",
    input,
  );
}
