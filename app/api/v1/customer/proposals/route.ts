import { proxyCustomerRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!requestId) return Response.json({ error: "requestId é obrigatório." }, { status: 400 });
  return proxyCustomerRequest(`/api/v1/service-requests/${encodeURIComponent(requestId)}/proposals`, request);
}

export async function POST(request: Request) {
  const payload = await request.json() as { proposalId?: string; scheduledFor?: string };
  if (!payload.proposalId) return Response.json({ error: "proposalId é obrigatório." }, { status: 400 });
  if (!payload.scheduledFor) return Response.json({ error: "scheduledFor é obrigatório." }, { status: 400 });
  return proxyCustomerRequest(
    `/api/v1/proposals/${encodeURIComponent(payload.proposalId)}/accept`,
    request,
    { scheduledFor: payload.scheduledFor },
  );
}
