import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = url.searchParams.get("days") ?? "30";
  return proxyDemoRequest(
    `/api/v1/operation/reports?days=${encodeURIComponent(days)}`,
    request,
    "operation",
  );
}
