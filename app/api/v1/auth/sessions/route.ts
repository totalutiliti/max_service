import {
  apiUrl,
  clearedProductionSessionCookie,
  crossOriginMutation,
  productionSessionToken,
  signedInternalHeaders,
} from "../../_session";
import { apiResponseHeaders } from "../../_response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = productionSessionToken(request);
  if (!token) return Response.json({ error: "Sessão de produção ausente." }, { status: 401 });
  return proxy(request, token, "GET", "/api/v1/auth/production-sessions/inventory");
}

export async function DELETE(request: Request) {
  if (crossOriginMutation(request)) {
    return Response.json({ error: "Origem da requisição inválida." }, { status: 403 });
  }
  const token = productionSessionToken(request);
  if (!token) {
    return Response.json(
      { revoked: true, scope: "all" },
      { headers: { "set-cookie": clearedProductionSessionCookie() } },
    );
  }
  const response = await proxy(
    request,
    token,
    "DELETE",
    "/api/v1/auth/production-sessions/all",
  );
  const headers = new Headers(response.headers);
  headers.append("set-cookie", clearedProductionSessionCookie());
  return new Response(response.body, { status: response.status, headers });
}

async function proxy(
  request: Request,
  token: string,
  method: "GET" | "DELETE",
  path: string,
) {
  try {
    const headers = await signedInternalHeaders(method, path);
    headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`${apiUrl()}${path}`, {
      method,
      headers,
      cache: "no-store",
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: apiResponseHeaders(response, {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "no-store",
      }),
    });
  } catch {
    return Response.json(
      { error: "O serviço de identidade está temporariamente indisponível." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
