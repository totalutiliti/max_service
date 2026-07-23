import { proxyDemoBinaryRequest, proxyDemoDownloadRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const attachmentId = new URL(request.url).searchParams.get("attachmentId");
  if (!attachmentId) return Response.json({ error: "attachmentId é obrigatório." }, { status: 400 });
  return proxyDemoDownloadRequest(`/api/v1/service-request-attachments/${encodeURIComponent(attachmentId)}`, request, "customer");
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 600_000) {
    return Response.json({ error: "A imagem excede o limite de 512 KB." }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const requestId = form?.get("requestId");
  const file = form?.get("file");
  if (typeof requestId !== "string" || !requestId || !file || typeof file === "string") {
    return Response.json({ error: "Pedido e imagem são obrigatórios." }, { status: 400 });
  }
  if (file.size < 8 || file.size > 524_288) {
    return Response.json({ error: "A imagem deve ter entre 8 bytes e 512 KB." }, { status: 413 });
  }
  if (!new Set(["image/jpeg", "image/png"]).has(file.type)) {
    return Response.json({ error: "Envie somente imagens JPEG ou PNG." }, { status: 400 });
  }
  return proxyDemoBinaryRequest(
    `/api/v1/service-requests/${encodeURIComponent(requestId)}/attachments`,
    request,
    "customer",
    await file.arrayBuffer(),
    file.type,
    file.name,
  );
}
