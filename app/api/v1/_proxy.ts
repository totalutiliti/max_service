import { apiUrl, crossOriginMutation, demoActorIds, type DemoRole, resolveDemoSession, signedInternalHeaders } from "./_session";

export async function proxyDemoRequest(path: string, request: Request, role: DemoRole, payload?: unknown) {
  if (crossOriginMutation(request)) return Response.json({ error: "Origem da requisição inválida." }, { status: 403 });
  const session = await resolveDemoSession(request);
  if (!session) return Response.json({ error: "Sessão ausente, expirada ou revogada." }, { status: 401 });
  if (session.role !== role || session.actorId !== demoActorIds[role]) {
    return Response.json({ error: "O perfil da sessão não tem acesso a este recurso." }, { status: 403 });
  }
  let headers: Headers;
  try {
    headers = await signedInternalHeaders(request.method, path, role, session.actorId);
  } catch {
    return Response.json({ error: "Canal interno da Max Service não configurado." }, { status: 503 });
  }

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("content-type", "application/json");
    body = payload === undefined ? await request.text() : JSON.stringify(payload);
  }

  try {
    const response = await fetch(`${apiUrl()}${path}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "A API da Max Service está temporariamente indisponível." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export function proxyCustomerRequest(path: string, request: Request, payload?: unknown) {
  return proxyDemoRequest(path, request, "customer", payload);
}
