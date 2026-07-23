import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const caseId = new URL(request.url).searchParams.get("caseId");
  const path = caseId
    ? `/api/v1/partner/support/cases/${encodeURIComponent(caseId)}`
    : "/api/v1/partner/support";
  return proxyDemoRequest(path, request, "partner");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    action?: "create" | "message";
    caseId?: string;
    topic?: "referral" | "account" | "finance_sandbox" | "other";
    subject?: string;
    body?: string;
    referralId?: string;
  };

  if (payload.action === "create") {
    return proxyDemoRequest("/api/v1/partner/support/cases", request, "partner", {
      topic: payload.topic,
      subject: payload.subject,
      body: payload.body,
      referralId: payload.referralId || undefined,
    });
  }
  if (payload.action === "message" && payload.caseId) {
    return proxyDemoRequest(
      `/api/v1/partner/support/cases/${encodeURIComponent(payload.caseId)}/messages`,
      request,
      "partner",
      { body: payload.body },
    );
  }
  return Response.json({ error: "Ação de atendimento inválida." }, { status: 400 });
}
