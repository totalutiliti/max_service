import { proxyDemoRequest } from "../../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest(
    "/api/v1/operation/reports/schedules",
    request,
    "operation",
  );
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    action?: "create" | "status" | "simulate";
    scheduleId?: string;
    label?: string;
    periodDays?: 7 | 30 | 90;
    cadence?: "weekly" | "monthly";
    recipientName?: string;
    recipientEmail?: string;
    purpose?: string;
    nextRunAt?: string;
    consentConfirmed?: boolean;
    status?: "active" | "paused";
    expectedVersion?: number;
    note?: string;
  };

  if (payload.action === "create") {
    const input = { ...payload };
    delete input.action;
    delete input.scheduleId;
    return proxyDemoRequest(
      "/api/v1/operation/reports/schedules",
      request,
      "operation",
      input,
    );
  }

  if (!payload.scheduleId) {
    return Response.json({ error: "scheduleId é obrigatório." }, { status: 400 });
  }

  if (payload.action === "status") {
    return proxyDemoRequest(
      `/api/v1/operation/reports/schedules/${encodeURIComponent(payload.scheduleId)}/status`,
      request,
      "operation",
      {
        status: payload.status,
        expectedVersion: payload.expectedVersion,
        note: payload.note,
      },
    );
  }

  if (payload.action === "simulate") {
    return proxyDemoRequest(
      `/api/v1/operation/reports/schedules/${encodeURIComponent(payload.scheduleId)}/simulate`,
      request,
      "operation",
      { expectedVersion: payload.expectedVersion },
    );
  }

  return Response.json({ error: "Ação de agendamento inválida." }, { status: 400 });
}
