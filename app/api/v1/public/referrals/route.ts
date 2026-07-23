import { apiUrl, crossOriginMutation, signedInternalHeaders } from "../../_session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const code = referralCode(new URL(request.url).searchParams.get("code"));
  if (!code) return Response.json({ error: "Código de indicação inválido." }, { status: 400 });
  return forwardPublicReferral(request, code);
}

export async function POST(request: Request) {
  if (crossOriginMutation(request)) {
    return Response.json({ error: "Origem da requisição inválida." }, { status: 403 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 8_192) {
    return Response.json({ error: "Dados da indicação excedem o limite permitido." }, { status: 413 });
  }

  let payload: {
    code?: string;
    professionalName?: string;
    email?: string;
    categorySlug?: string;
    source?: string;
    consent?: boolean;
    website?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Dados da indicação inválidos." }, { status: 400 });
  }
  const code = referralCode(payload.code ?? null);
  if (!code) return Response.json({ error: "Código de indicação inválido." }, { status: 400 });
  const body = {
    professionalName: payload.professionalName,
    email: payload.email,
    categorySlug: payload.categorySlug,
    source: payload.source,
    consent: payload.consent,
    website: payload.website,
  };
  return forwardPublicReferral(request, code, body);
}

async function forwardPublicReferral(request: Request, code: string, body?: unknown) {
  const path = `/api/v1/public/referrals/${encodeURIComponent(code)}`;
  try {
    const headers = await signedInternalHeaders(request.method, path, "public_referral");
    let serialized: string | undefined;
    if (body !== undefined) {
      headers.set("content-type", "application/json");
      serialized = JSON.stringify(body);
    }
    const response = await fetch(`${apiUrl()}${path}`, {
      method: request.method,
      headers,
      body: serialized,
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
      { error: "A indicação está temporariamente indisponível." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

function referralCode(value: string | null) {
  const code = value?.trim().toUpperCase() ?? "";
  return /^PC-[A-Z0-9]{4,16}$/.test(code) ? code : null;
}
