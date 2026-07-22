import { proxyDemoBinaryRequest, proxyDemoDownloadRequest, proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const fileId = new URL(request.url).searchParams.get("fileId");
  if (fileId) {
    return proxyDemoDownloadRequest(`/api/v1/provider/verification/files/${encodeURIComponent(fileId)}`, request, "provider");
  }
  return proxyDemoRequest("/api/v1/provider/verification", request, "provider");
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const documentId = form?.get("documentId");
  const file = form?.get("file");
  if (typeof documentId !== "string" || !documentId || !file || typeof file === "string") {
    return Response.json({ error: "Documento e arquivo são obrigatórios." }, { status: 400 });
  }
  if (file.size < 4 || file.size > 2_097_152) {
    return Response.json({ error: "O arquivo deve ter entre 4 bytes e 2 MB." }, { status: 413 });
  }
  if (!new Set(["application/pdf", "image/jpeg", "image/png"]).has(file.type)) {
    return Response.json({ error: "Envie somente PDF, JPEG ou PNG." }, { status: 400 });
  }
  return proxyDemoBinaryRequest(
    `/api/v1/provider/verification/documents/${encodeURIComponent(documentId)}/files`,
    request,
    "provider",
    await file.arrayBuffer(),
    file.type,
    file.name,
  );
}
