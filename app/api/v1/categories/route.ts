import { proxyDemoRequest } from "../_proxy";

export const dynamic = "force-dynamic";

const catalogRoles = ["customer", "provider", "partner", "advertiser"] as const;

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/categories", request, catalogRoles);
}
