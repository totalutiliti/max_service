import { proxyDemoRequest } from "../_proxy";

export const dynamic = "force-dynamic";

const marketplaceRoles = ["customer", "provider", "advertiser"] as const;

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/regions", request, marketplaceRoles);
}
