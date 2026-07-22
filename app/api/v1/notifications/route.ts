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
  const role = roleFor(new URL(request.url).searchParams.get("role") ?? undefined);
  if (!role) return Response.json({ error: "Perfil inválido." }, { status: 403 });
  return proxyDemoRequest("/api/v1/notifications", request, role);
}

export async function POST(request: Request) {
  const payload = await request.json() as { role?: string; action?: "read" | "read-all"; notificationId?: string };
  const role = roleFor(payload.role);
  if (!role) return Response.json({ error: "Perfil inválido." }, { status: 403 });
  if (payload.action === "read-all") return proxyDemoRequest("/api/v1/notifications/read-all", request, role, {});
  if (payload.action === "read" && payload.notificationId) {
    return proxyDemoRequest(`/api/v1/notifications/${encodeURIComponent(payload.notificationId)}/read`, request, role, {});
  }
  return Response.json({ error: "Ação de notificação inválida." }, { status: 400 });
}
