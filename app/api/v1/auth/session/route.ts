import {
  apiUrl,
  clearedSessionCookie,
  crossOriginMutation,
  type DemoRole,
  resolveDemoSession,
  sessionCookie,
  sessionToken,
  signedInternalHeaders,
} from "../../_session";

export const dynamic = "force-dynamic";

const roleMap: Record<string, DemoRole> = {
  cliente: "customer",
  prestador: "provider",
  parceiro: "partner",
  operacao: "operation",
};

export async function GET(request: Request) {
  const session = await resolveDemoSession(request);
  if (!session) {
    return Response.json(
      { error: "Sessão ausente, expirada ou revogada." },
      { status: 401, headers: sessionResponseHeaders(clearedSessionCookie()) },
    );
  }
  return Response.json({ session }, { headers: sessionResponseHeaders() });
}

export async function POST(request: Request) {
  if (crossOriginMutation(request)) return Response.json({ error: "Origem da requisição inválida." }, { status: 403 });
  const payload = await request.json().catch(() => null) as { role?: string } | null;
  const role = payload?.role ? roleMap[payload.role] : null;
  if (!role) return Response.json({ error: "Perfil demonstrativo inválido." }, { status: 400 });

  const path = "/api/v1/auth/demo-sessions";
  try {
    const headers = await signedInternalHeaders("POST", path);
    headers.set("content-type", "application/json");
    const current = sessionToken(request);
    if (current) headers.set("authorization", `Bearer ${current}`);
    const response = await fetch(`${apiUrl()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ role }),
      cache: "no-store",
    });
    const result = await response.json() as { token?: string; session?: { expiresAt: string }; error?: string };
    if (!response.ok || !result.token || !result.session) {
      return Response.json({ error: result.error ?? "Não foi possível iniciar a sessão." }, { status: response.status });
    }
    const maxAge = Math.max(0, Math.floor((new Date(result.session.expiresAt).getTime() - Date.now()) / 1000));
    return Response.json(
      { session: result.session },
      { status: 201, headers: sessionResponseHeaders(sessionCookie(result.token, maxAge)) },
    );
  } catch {
    return Response.json({ error: "O serviço de sessão está temporariamente indisponível." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (crossOriginMutation(request)) return Response.json({ error: "Origem da requisição inválida." }, { status: 403 });
  const token = sessionToken(request);
  if (token) {
    const path = "/api/v1/auth/demo-sessions/current";
    try {
      const headers = await signedInternalHeaders("DELETE", path);
      headers.set("authorization", `Bearer ${token}`);
      await fetch(`${apiUrl()}${path}`, { method: "DELETE", headers, cache: "no-store" });
    } catch {
      // O cookie local ainda deve ser removido se a API estiver indisponível.
    }
  }
  return Response.json({ revoked: true }, { headers: sessionResponseHeaders(clearedSessionCookie()) });
}

function sessionResponseHeaders(cookie?: string) {
  const headers = new Headers({ "cache-control": "no-store" });
  if (cookie) headers.set("set-cookie", cookie);
  return headers;
}
