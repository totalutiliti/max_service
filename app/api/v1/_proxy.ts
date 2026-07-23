import { apiUrl, crossOriginMutation, demoActorIds, type DemoRole, resolveDemoSession, signedInternalHeaders } from "./_session";

export async function proxyDemoRequest(
  path: string,
  request: Request,
  role: DemoRole,
  payload?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const authorization = await authorize(path, request, role);
  if (authorization instanceof Response) return authorization;
  const headers = authorization;
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);

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

export async function proxyDemoBinaryRequest(
  path: string,
  request: Request,
  role: DemoRole,
  body: ArrayBuffer,
  contentType: string,
  fileName: string,
  extraHeaders: Record<string, string> = {},
) {
  const authorization = await authorize(path, request, role);
  if (authorization instanceof Response) return authorization;
  const headers = authorization;
  headers.set("content-type", contentType);
  headers.set("content-length", String(body.byteLength));
  headers.set("x-file-name", encodeURIComponent(fileName));
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  try {
    const response = await fetch(`${apiUrl()}${path}`, { method: request.method, headers, body, cache: "no-store" });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "O armazenamento privado está temporariamente indisponível." }, { status: 503 });
  }
}

export async function proxyDemoDownloadRequest(path: string, request: Request, role: DemoRole) {
  const authorization = await authorize(path, request, role);
  if (authorization instanceof Response) return authorization;
  try {
    const response = await fetch(`${apiUrl()}${path}`, { method: "GET", headers: authorization, cache: "no-store" });
    const headers = new Headers({
      "content-type": response.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
    const disposition = response.headers.get("content-disposition");
    const length = response.headers.get("content-length");
    if (disposition) headers.set("content-disposition", disposition);
    if (length) headers.set("content-length", length);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ error: "O arquivo privado está temporariamente indisponível." }, { status: 503 });
  }
}

async function authorize(path: string, request: Request, role: DemoRole): Promise<Headers | Response> {
  if (crossOriginMutation(request)) return Response.json({ error: "Origem da requisição inválida." }, { status: 403 });
  const session = await resolveDemoSession(request);
  if (!session) return Response.json({ error: "Sessão ausente, expirada ou revogada." }, { status: 401 });
  if (session.role !== role || session.actorId !== demoActorIds[role]) {
    return Response.json({ error: "O perfil da sessão não tem acesso a este recurso." }, { status: 403 });
  }
  try {
    return await signedInternalHeaders(request.method, path, role, session.actorId);
  } catch {
    return Response.json({ error: "Canal interno da Max Service não configurado." }, { status: 503 });
  }
}

export function proxyCustomerRequest(path: string, request: Request, payload?: unknown) {
  return proxyDemoRequest(path, request, "customer", payload);
}
