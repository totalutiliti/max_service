import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/provider/matching", request, "provider");
}

export async function POST(request: Request) {
  const payload = await request.json();
  return proxyDemoRequest("/api/v1/provider/matching", request, "provider", payload);
}
