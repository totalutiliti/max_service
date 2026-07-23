import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const referralId = new URL(request.url).searchParams.get("referralId");
  const path = referralId
    ? `/api/v1/operation/referrals/${encodeURIComponent(referralId)}`
    : "/api/v1/operation/referrals";
  return proxyDemoRequest(path, request, "operation");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    referralId?: string;
    status?: "in_review" | "approved" | "rejected";
    note?: string;
  };
  if (!payload.referralId) {
    return Response.json({ error: "referralId é obrigatório." }, { status: 400 });
  }
  return proxyDemoRequest(
    `/api/v1/operation/referrals/${encodeURIComponent(payload.referralId)}/transitions`,
    request,
    "operation",
    { status: payload.status, note: payload.note },
  );
}
