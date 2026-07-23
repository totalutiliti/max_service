import { proxyDemoBinaryRequest, proxyDemoDownloadRequest, proxyDemoRequest } from "../_proxy";

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
  const attachmentId = url.searchParams.get("attachmentId");
  if (attachmentId) {
    return proxyDemoDownloadRequest(`/api/v1/message-attachments/${encodeURIComponent(attachmentId)}`, request, role);
  }
  const conversationId = url.searchParams.get("conversationId");
  const afterMessageId = url.searchParams.get("after");
  if (afterMessageId && !conversationId) {
    return Response.json({ error: "conversationId é obrigatório para sincronizar mensagens." }, { status: 400 });
  }
  if (afterMessageId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(afterMessageId)) {
    return Response.json({ error: "Cursor de mensagem inválido." }, { status: 400 });
  }
  const path = conversationId
    ? `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`
    : "/api/v1/conversations";
  return proxyDemoRequest(path, request, role, undefined, afterMessageId ? { "x-after-message-id": afterMessageId } : {});
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > 600_000) {
      return Response.json({ error: "A imagem excede o limite de 512 KB." }, { status: 413 });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "Formulário de anexo inválido." }, { status: 400 });
    }
    const roleValue = form.get("role");
    const conversationValue = form.get("conversationId");
    const bodyValue = form.get("body");
    const role = mapRole(typeof roleValue === "string" ? roleValue : null);
    const conversationId = typeof conversationValue === "string" ? conversationValue : "";
    const body = typeof bodyValue === "string" ? bodyValue.trim() : "";
    const file = form.get("file");
    if (!role) return Response.json({ error: "Perfil sem acesso a conversas." }, { status: 403 });
    if (!conversationId) return Response.json({ error: "conversationId é obrigatório." }, { status: 400 });
    if (!(file instanceof File)) return Response.json({ error: "Selecione uma imagem." }, { status: 400 });
    if (file.size < 8 || file.size > 524_288) {
      return Response.json({ error: "A imagem deve ter entre 8 bytes e 512 KB." }, { status: 413 });
    }
    if (!new Set(["image/jpeg", "image/png"]).has(file.type)) {
      return Response.json({ error: "Envie somente imagens JPEG ou PNG." }, { status: 400 });
    }
    if (body.length > 2000) return Response.json({ error: "A mensagem deve ter no máximo 2.000 caracteres." }, { status: 400 });
    return proxyDemoBinaryRequest(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}/message-attachments`,
      request,
      role,
      await file.arrayBuffer(),
      file.type,
      file.name,
      { "x-message-body": encodeURIComponent(body) },
    );
  }

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

export async function PATCH(request: Request) {
  const payload = await request.json() as { role?: string; conversationId?: string; messageId?: string };
  const role = mapRole(payload.role ?? null);
  if (!role) return Response.json({ error: "Perfil sem acesso a conversas." }, { status: 403 });
  if (!payload.conversationId || !payload.messageId) {
    return Response.json({ error: "conversationId e messageId são obrigatórios." }, { status: 400 });
  }
  return proxyDemoRequest(
    `/api/v1/conversations/${encodeURIComponent(payload.conversationId)}/read`,
    request,
    role,
    { messageId: payload.messageId },
  );
}
