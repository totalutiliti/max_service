import { proxyDemoRequest } from "../_proxy";

export const dynamic = "force-dynamic";

const roleMap = {
  cliente: "customer",
  prestador: "provider",
  parceiro: "partner",
  operacao: "operation",
} as const;

function roleFor(value: string | undefined) {
  return value && value in roleMap ? roleMap[value as keyof typeof roleMap] : null;
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const role = roleFor(searchParams.get("role") ?? undefined);
  if (!role) return Response.json({ error: "Perfil inválido." }, { status: 403 });
  if (searchParams.get("channel") === "push") {
    return proxyDemoRequest("/api/v1/notifications/push", request, role);
  }
  return proxyDemoRequest("/api/v1/notifications", request, role);
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    role?: string;
    action?: "read" | "read-all" | "subscribe-push" | "status-push" | "unsubscribe-push";
    notificationId?: string;
    endpoint?: unknown;
    subscription?: unknown;
  };
  const role = roleFor(payload.role);
  if (!role) return Response.json({ error: "Perfil inválido." }, { status: 403 });
  if (payload.action === "read-all") return proxyDemoRequest("/api/v1/notifications/read-all", request, role, {});
  if (payload.action === "read" && payload.notificationId) {
    return proxyDemoRequest(`/api/v1/notifications/${encodeURIComponent(payload.notificationId)}/read`, request, role, {});
  }
  if (payload.action === "subscribe-push") {
    return proxyDemoRequest("/api/v1/notifications/push/subscribe", request, role, {
      subscription: payload.subscription,
    });
  }
  if (payload.action === "status-push") {
    return proxyDemoRequest("/api/v1/notifications/push/status", request, role, {
      endpoint: payload.endpoint,
    });
  }
  if (payload.action === "unsubscribe-push") {
    return proxyDemoRequest("/api/v1/notifications/push/unsubscribe", request, role, {
      endpoint: payload.endpoint,
    });
  }
  return Response.json({ error: "Ação de notificação inválida." }, { status: 400 });
}
