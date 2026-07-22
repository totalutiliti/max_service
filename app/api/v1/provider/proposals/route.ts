import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json() as {
    requestId?: string;
    amountCents?: number;
    estimatedMinutes?: number;
    message?: string;
  };
  if (!payload.requestId) return Response.json({ error: "requestId é obrigatório." }, { status: 400 });
  const { requestId, ...proposal } = payload;
  return proxyDemoRequest(
    `/api/v1/service-requests/${encodeURIComponent(requestId)}/proposals`,
    request,
    "provider",
    proposal,
  );
}
