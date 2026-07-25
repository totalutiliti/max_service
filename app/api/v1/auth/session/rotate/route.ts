import {
  apiUrl,
  crossOriginMutation,
  productionSessionCookie,
  productionSessionToken,
  signedInternalHeaders,
} from "../../../_session";
import { apiResponseHeaders } from "../../../_response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (crossOriginMutation(request)) {
    return Response.json({ error: "Origem da requisição inválida." }, { status: 403 });
  }
  const token = productionSessionToken(request);
  if (!token) return Response.json({ error: "Sessão de produção ausente." }, { status: 401 });
  const path = "/api/v1/auth/production-sessions/current/rotate";
  try {
    const headers = await signedInternalHeaders("POST", path);
    headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`${apiUrl()}${path}`, {
      method: "POST",
      headers,
      cache: "no-store",
    });
    const result = await response.json() as {
      token?: string;
      session?: { expiresAt: string; idleExpiresAt: string };
      error?: string;
      message?: string;
    };
    if (!response.ok || !result.token || !result.session) {
      return Response.json(
        { error: result.message ?? result.error ?? "Não foi possível rotacionar a sessão." },
        { status: response.status, headers: apiResponseHeaders(response) },
      );
    }
    const validity = Math.min(
      new Date(result.session.expiresAt).getTime(),
      new Date(result.session.idleExpiresAt).getTime(),
    );
    const maxAge = Math.max(0, Math.floor((validity - Date.now()) / 1_000));
    return Response.json(
      { session: result.session },
      {
        headers: apiResponseHeaders(response, {
          "cache-control": "no-store",
          "set-cookie": productionSessionCookie(result.token, maxAge),
        }),
      },
    );
  } catch {
    return Response.json(
      { error: "O serviço de identidade está temporariamente indisponível." },
      { status: 503 },
    );
  }
}
