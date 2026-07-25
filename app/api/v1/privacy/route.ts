import { proxyDemoRequest } from "../_proxy";

export const dynamic = "force-dynamic";

const subjectRoles = ["customer", "provider", "partner", "advertiser"] as const;

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/privacy/requests", request, subjectRoles);
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    action?: "create" | "export";
    requestId?: string;
    requestType?: "access" | "correction" | "deletion" | "restriction" | "consent_withdrawal";
    description?: string;
    acknowledgement?: boolean;
  };

  if (payload.action === "create") {
    return proxyDemoRequest(
      "/api/v1/privacy/requests",
      request,
      subjectRoles,
      {
        requestType: payload.requestType,
        description: payload.description,
        acknowledgement: payload.acknowledgement,
      },
    );
  }

  if (payload.action === "export" && payload.requestId) {
    return proxyDemoRequest(
      `/api/v1/privacy/requests/${encodeURIComponent(payload.requestId)}/export`,
      request,
      subjectRoles,
      {},
    );
  }

  return Response.json({ error: "Ação de privacidade inválida." }, { status: 400 });
}
