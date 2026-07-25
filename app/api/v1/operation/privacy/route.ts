import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/operation/privacy", request, "operation");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    requestId?: string;
    status?: "in_review" | "awaiting_subject" | "fulfilled" | "denied";
    expectedVersion?: number;
    note?: string;
  };

  if (!payload.requestId) {
    return Response.json({ error: "requestId é obrigatório." }, { status: 400 });
  }

  return proxyDemoRequest(
    `/api/v1/operation/privacy/${encodeURIComponent(payload.requestId)}/transitions`,
    request,
    "operation",
    {
      status: payload.status,
      expectedVersion: payload.expectedVersion,
      note: payload.note,
    },
  );
}
