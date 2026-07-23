import { proxyDemoDownloadRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const attachmentId = new URL(request.url).searchParams.get("attachmentId");
  if (!attachmentId) return Response.json({ error: "attachmentId é obrigatório." }, { status: 400 });
  return proxyDemoDownloadRequest(`/api/v1/service-request-attachments/${encodeURIComponent(attachmentId)}`, request, "provider");
}
