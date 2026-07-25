import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return proxyDemoRequest(
    `/api/v1/advertising/contextual${url.search}`,
    request,
    "customer",
  );
}
