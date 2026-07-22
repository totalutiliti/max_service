import { crossOriginMutation, resolveDemoSession } from "../../_session";

export const dynamic = "force-dynamic";

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  if (crossOriginMutation(request)) return Response.json({ error: "Origem da requisição inválida." }, { status: 403 });
  const session = await resolveDemoSession(request);
  if (!session) return Response.json({ error: "Sessão ausente, expirada ou revogada." }, { status: 401 });
  if (session.role !== "operation") return Response.json({ error: "Somente a operação pode simular eventos financeiros." }, { status: 403 });
  const payload = await request.json() as { intentId?: string; eventType?: "settlement" | "refund"; amountCents?: number };
  if (!payload.intentId || !payload.eventType || !Number.isInteger(payload.amountCents) || Number(payload.amountCents) <= 0) {
    return Response.json({ error: "Evento financeiro sandbox inválido." }, { status: 400 });
  }
  const secret = process.env.FINANCIAL_SANDBOX_SECRET;
  if (!secret) return Response.json({ error: "Sandbox financeiro não configurado." }, { status: 503 });

  const event = {
    eventId: crypto.randomUUID(),
    intentId: payload.intentId,
    eventType: payload.eventType,
    amountCents: Number(payload.amountCents),
  };
  const timestamp = String(Math.floor(Date.now() / 1000));
  const canonical = `${timestamp}.${event.eventId}.${event.intentId}.${event.eventType}.${event.amountCents}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical)))}`;
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

  try {
    const response = await fetch(`${apiUrl}/api/v1/finance/sandbox/events`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-sandbox-signature": signature,
        "x-sandbox-timestamp": timestamp,
      },
      body: JSON.stringify(event),
      cache: "no-store",
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "A API financeira sandbox está indisponível." }, { status: 503 });
  }
}
