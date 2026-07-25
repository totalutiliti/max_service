import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/advertiser/campaigns", request, "advertiser");
}

export async function POST(request: Request) {
  return proxyDemoRequest("/api/v1/advertiser/campaigns", request, "advertiser");
}
