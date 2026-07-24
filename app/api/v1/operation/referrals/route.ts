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
    action?: "transition" | "risk_review";
    status?: "in_review" | "approved" | "rejected";
    outcome?: "cleared" | "confirmed";
    note?: string;
  };
  if (!payload.referralId) {
    return Response.json({ error: "referralId é obrigatório." }, { status: 400 });
  }
  if (payload.action === "risk_review") {
    return proxyDemoRequest(
      `/api/v1/operation/referrals/${encodeURIComponent(payload.referralId)}/risk-review`,
      request,
      "operation",
      { outcome: payload.outcome, note: payload.note },
    );
  }
  return proxyDemoRequest(
    `/api/v1/operation/referrals/${encodeURIComponent(payload.referralId)}/transitions`,
    request,
    "operation",
    { status: payload.status, note: payload.note },
  );
}
