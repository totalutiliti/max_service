import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/operation/categories", request, "operation");
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    categoryId?: string;
    action?: "activate" | "deactivate" | "move_up" | "move_down";
    note?: string;
  };
  if (!payload.categoryId) {
    return Response.json({ error: "Categoria não informada." }, { status: 400 });
  }
  return proxyDemoRequest(
    `/api/v1/operation/categories/${encodeURIComponent(payload.categoryId)}/actions`,
    request,
    "operation",
    { action: payload.action, note: payload.note },
  );
}
