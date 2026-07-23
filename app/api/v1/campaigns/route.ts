import { proxyCustomerRequest } from "../_proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyCustomerRequest("/api/v1/campaigns/validate", request);
}
