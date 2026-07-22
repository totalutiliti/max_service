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
  if (!role) return Response.json({ error: "Perfil sem acesso à agenda." }, { status: 403 });
  const bookingId = url.searchParams.get("bookingId");
  const path = bookingId ? `/api/v1/bookings/${encodeURIComponent(bookingId)}` : "/api/v1/bookings";
  return proxyDemoRequest(path, request, role);
}

export async function POST(request: Request) {
  const payload = await request.json() as { role?: string; bookingId?: string; status?: string; note?: string };
  const role = mapRole(payload.role ?? null);
  if (!role) return Response.json({ error: "Perfil sem acesso à agenda." }, { status: 403 });
  if (role !== "provider") return Response.json({ error: "Somente o profissional pode atualizar o serviço." }, { status: 403 });
  if (!payload.bookingId) return Response.json({ error: "bookingId é obrigatório." }, { status: 400 });
  return proxyDemoRequest(
    `/api/v1/bookings/${encodeURIComponent(payload.bookingId)}/transitions`,
    request,
    role,
    { status: payload.status, note: payload.note },
  );
}
