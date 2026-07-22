import { proxyDemoRequest } from "../_proxy";

export const dynamic = "force-dynamic";

function mapRole(role: string | null) {
  if (role === "cliente") return "customer" as const;
  if (role === "prestador") return "provider" as const;
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = mapRole(url.searchParams.get("role"));
  if (!role) return Response.json({ error: "Perfil sem acesso a conversas." }, { status: 403 });
  const conversationId = url.searchParams.get("conversationId");
  const path = conversationId
    ? `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`
    : "/api/v1/conversations";
  return proxyDemoRequest(path, request, role);
}

export async function POST(request: Request) {
  const payload = await request.json() as { role?: string; conversationId?: string; body?: string };
  const role = mapRole(payload.role ?? null);
  if (!role) return Response.json({ error: "Perfil sem acesso a conversas." }, { status: 403 });
  if (!payload.conversationId) return Response.json({ error: "conversationId é obrigatório." }, { status: 400 });
  return proxyDemoRequest(
    `/api/v1/conversations/${encodeURIComponent(payload.conversationId)}/messages`,
    request,
    role,
    { body: payload.body },
  );
}
