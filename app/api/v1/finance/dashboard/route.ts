import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

function mapRole(role: string | null) {
  if (role === "cliente") return "customer" as const;
  if (role === "prestador") return "provider" as const;
  if (role === "parceiro") return "partner" as const;
  if (role === "operacao") return "operation" as const;
  return null;
}

export async function GET(request: Request) {
  const role = mapRole(new URL(request.url).searchParams.get("role"));
  if (!role) return Response.json({ error: "Perfil financeiro inválido." }, { status: 403 });
  return proxyDemoRequest("/api/v1/finance/dashboard", request, role);
}
