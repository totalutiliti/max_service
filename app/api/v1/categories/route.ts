import { proxyCustomerRequest } from "../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyCustomerRequest("/api/v1/categories", request);
}
