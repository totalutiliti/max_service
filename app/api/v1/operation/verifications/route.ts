import { proxyDemoDownloadRequest, proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fileId = url.searchParams.get("fileId");
  if (fileId) {
    return proxyDemoDownloadRequest(`/api/v1/operation/verifications/files/${encodeURIComponent(fileId)}`, request, "operation");
  }
  const verificationId = url.searchParams.get("verificationId");
  const path = verificationId
    ? `/api/v1/operation/verifications/${encodeURIComponent(verificationId)}`
    : "/api/v1/operation/verifications";
  return proxyDemoRequest(path, request, "operation");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    verificationId?: string;
    documentId?: string;
    action?: "status" | "document";
    status?: string;
    note?: string;
  };
  if (!payload.verificationId) return Response.json({ error: "verificationId é obrigatório." }, { status: 400 });
  if (payload.action === "status") {
    return proxyDemoRequest(
      `/api/v1/operation/verifications/${encodeURIComponent(payload.verificationId)}/transitions`,
      request,
      "operation",
      { status: payload.status, note: payload.note },
    );
  }
  if (payload.action === "document" && payload.documentId) {
    return proxyDemoRequest(
      `/api/v1/operation/verifications/${encodeURIComponent(payload.verificationId)}/documents/${encodeURIComponent(payload.documentId)}/reviews`,
      request,
      "operation",
      { status: payload.status, note: payload.note },
    );
  }
  return Response.json({ error: "Ação de verificação inválida." }, { status: 400 });
}
