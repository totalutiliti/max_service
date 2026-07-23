import { proxyCustomerRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const proposalId = new URL(request.url).searchParams.get("proposalId");
  if (!proposalId) return Response.json({ error: "proposalId é obrigatório." }, { status: 400 });
  return proxyCustomerRequest(
    `/api/v1/proposals/${encodeURIComponent(proposalId)}/slots`,
    request,
  );
}
