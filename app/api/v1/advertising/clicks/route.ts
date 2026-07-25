import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyDemoRequest("/api/v1/advertising/clicks", request, "customer");
}
