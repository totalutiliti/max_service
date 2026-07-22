import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/operation/cases", request, "operation");
}
